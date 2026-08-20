from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/custom-requests")
async def create_custom_request(data: CustomRequestIn, user=Depends(current_user)):
    doc = {**data.model_dump(), "customer_id": oid(user["id"]), "customer_name": user["name"],
           "status": "submitted", "estimate": None, "assigned_to": None,
           "delivery_images": [], "payment_type": "", "history": [
               {"status": "submitted", "at": datetime.now(timezone.utc).isoformat(), "by": user["name"]}],
           "created_at": datetime.now(timezone.utc)}
    res = await db.custom_requests.insert_one(doc)
    for admin in await db.users.find({"role": {"$in": list(ADMIN_ROLES)}}).to_list(10):
        await notify(admin["_id"], "custom_request", f"New custom request: {data.title}", "/admin")
    return pub(await db.custom_requests.find_one({"_id": res.inserted_id}))


@router.get("/custom-requests")
async def list_custom_requests(user=Depends(current_user)):
    uid = oid(user["id"])
    if user["role"] in STAFF_ROLES:
        query = {}
    elif user["role"] in {"company_owner", "company_admin"} and user.get("company_id"):
        query = {"$or": [{"customer_id": uid},
                         {"target_id": user["company_id"], "target_type": "company"}]}
    elif user["role"] == "company_artist" and user.get("company_id"):
        query = {"$or": [{"customer_id": uid}, {"assigned_to": str(uid)}]}
    else:
        query = {"$or": [{"customer_id": uid}, {"target_id": user["id"], "target_type": "user"}]}
    reqs = await db.custom_requests.find(query).sort("created_at", -1).to_list(200)
    out = []
    for r in reqs:
        item = pub(r)
        if r["target_type"] == "company":
            comp = await db.companies.find_one({"_id": oid(r["target_id"])})
            item["target_name"] = comp["name"] if comp else "Company"
        else:
            t = await db.users.find_one({"_id": oid(r["target_id"])})
            item["target_name"] = t["name"] if t else "Artist"
        out.append(item)
    return out


@router.post("/custom-requests/{cr_id}/review")
async def review_custom_request(cr_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] not in {"submitted", "under_review"}:
        raise HTTPException(400, "Request not reviewable")
    body = await request.json()
    if body.get("approve", True):
        await cr_transition(cr, "sent_to_creator", user["name"])
        target = cr["target_id"]
        if cr["target_type"] == "company":
            company = await db.companies.find_one({"_id": oid(target)})
            for m in (company["members"] if company else []):
                if m["role"] in {"owner", "admin"}:
                    await notify(m["user_id"], "custom_request", f"New custom request: {cr['title']}", "/custom-orders")
        else:
            await notify(oid(target), "custom_request", f"New custom request: {cr['title']}", "/custom-orders")
        await notify(cr["customer_id"], "custom_request", f"Your request '{cr['title']}' was sent to the creator", "/custom-orders")
    else:
        await cr_transition(cr, "rejected", user["name"])
        await notify(cr["customer_id"], "custom_request", f"Your request '{cr['title']}' was declined in review", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/estimate")
async def estimate_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "sent_to_creator":
        raise HTTPException(400, "Request not awaiting estimate")
    await cr_creator_check(user, cr)
    if cr["target_type"] == "company" and not await seller_verified(user):
        raise HTTPException(403, "Company verification required before accepting paid work")
    body = await request.json()
    estimate = {"cost": float(body["cost"]), "deadline": body.get("deadline", ""),
                "message": body.get("message", ""), "by": user["name"],
                "at": datetime.now(timezone.utc).isoformat()}
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"estimate": estimate}})
    cr["estimate"] = estimate
    await cr_transition(cr, "estimated", user["name"])
    await notify(cr["customer_id"], "custom_request", f"Estimate ready for '{cr['title']}': ₹{estimate['cost']:,.0f}", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/respond")
async def respond_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "estimated":
        raise HTTPException(400, "Request not awaiting your approval")
    body = await request.json()
    if not body.get("accept", False):
        await cr_transition(cr, "declined", user["name"])
        return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))
    payment_type = body.get("payment_type", "full")
    if payment_type not in {"advance", "full"}:
        raise HTTPException(400, "payment_type must be advance or full")
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"payment_type": payment_type}})
    cr["payment_type"] = payment_type
    await cr_transition(cr, "approved", user["name"])
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/pay")
async def pay_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "approved":
        raise HTTPException(400, "Request not payable")
    body = await request.json()
    payment = await db.payments.find_one({"_id": oid(body.get("payment_db_id", "")), "ref_id": cr_id, "escrow": "held"})
    if not payment:
        raise HTTPException(400, "Payment not found")
    await cr_transition(cr, "paid", user["name"])
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {
        "advance_paid": cr.get("payment_type") == "advance", "paid_amount": payment["amount"]}})
    target = cr["target_id"]
    if cr["target_type"] == "company":
        company = await db.companies.find_one({"_id": oid(target)})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "custom_request", f"Payment received for '{cr['title']}' — assign an artist", "/custom-orders")
    else:
        await notify(oid(target), "custom_request", f"Payment received for '{cr['title']}' — work can begin", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/pay-balance")
async def pay_custom_balance(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"]:
        raise HTTPException(400, "Request not payable")
    if cr.get("payment_type") != "advance" or cr.get("balance_paid"):
        raise HTTPException(400, "No balance payment due")
    if cr["status"] not in {"in_progress", "delivered"}:
        raise HTTPException(400, "Balance payable once work is in progress")
    body = await request.json()
    payment = await db.payments.find_one({"_id": oid(body.get("payment_db_id", "")), "ref_id": cr_id,
                                          "purpose": "custom_balance", "escrow": "held"})
    if not payment:
        raise HTTPException(400, "Payment not found")
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {
        "balance_paid": True, "balance_amount": payment["amount"],
        "balance_paid_at": datetime.now(timezone.utc)}})
    target = cr["target_id"]
    if cr["target_type"] == "company":
        company = await db.companies.find_one({"_id": oid(target)})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "custom_request", f"Balance payment received for '{cr['title']}'", "/custom-orders")
    else:
        await notify(oid(target), "custom_request", f"Balance payment received for '{cr['title']}'", "/custom-orders")
    await audit(user, "custom_balance_paid", cr_id, {"amount": payment["amount"]})
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/assign")
async def assign_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["target_type"] != "company" or cr["status"] not in {"paid", "in_progress"}:
        raise HTTPException(400, "Request not assignable")
    await cr_creator_check(user, cr)
    body = await request.json()
    company, _ = await company_role(user, cr["target_id"])
    artist = next((m for m in company["members"] if str(m["user_id"]) == body.get("artist_id")), None)
    if not artist:
        raise HTTPException(404, "Artist not in company")
    await db.custom_requests.update_one({"_id": cr["_id"]},
                                        {"$set": {"assigned_to": str(artist["user_id"]), "assigned_name": artist["name"]}})
    await notify(artist["user_id"], "custom_request", f"You were assigned to '{cr['title']}'", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/start")
async def start_custom_request(cr_id: str, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "paid":
        raise HTTPException(400, "Request not ready to start")
    if cr["target_type"] == "company":
        allowed = str(cr.get("assigned_to") or "") == user["id"] or user["role"] in {"company_owner", "company_admin"}
        if not allowed:
            raise HTTPException(403, "Not assigned to you")
        await company_role(user, cr["target_id"])
    elif str(cr["target_id"]) != user["id"]:
        raise HTTPException(403, "Not your request")
    await cr_transition(cr, "in_progress", user["name"])
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/deliver")
async def deliver_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "in_progress":
        raise HTTPException(400, "Request not in progress")
    if cr["target_type"] == "company":
        allowed = str(cr.get("assigned_to") or "") == user["id"] or user["role"] in {"company_owner", "company_admin"}
        if not allowed:
            raise HTTPException(403, "Not assigned to you")
        await company_role(user, cr["target_id"])
    elif str(cr["target_id"]) != user["id"]:
        raise HTTPException(403, "Not your request")
    body = await request.json()
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {
        "delivery_images": body.get("delivery_images", []), "delivery_note": body.get("note", "")}})
    await cr_transition(cr, "delivered", user["name"])
    await notify(cr["customer_id"], "custom_request", f"'{cr['title']}' was delivered for review", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/complete")
async def complete_custom_request(cr_id: str, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "delivered":
        raise HTTPException(400, "Request not awaiting your review")
    if cr.get("payment_type") == "advance" and not cr.get("balance_paid"):
        raise HTTPException(400, "Balance payment due before completion")
    await cr_transition(cr, "completed", user["name"])
    await release_escrow(cr_id, "custom")
    await release_escrow(cr_id, "custom_balance")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@router.post("/custom-requests/{cr_id}/messages")
async def message_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr:
        raise HTTPException(404, "Request not found")
    await cr_participant_check(user, cr)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Message text required")
    msg = {"id": uuid.uuid4().hex[:10], "from": user["name"], "user_id": str(oid(user["id"])),
           "text": text, "at": datetime.now(timezone.utc).isoformat()}
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$push": {"messages": msg}})
    other = cr["target_id"] if str(cr["customer_id"]) == user["id"] else str(cr["customer_id"])
    if cr["target_type"] == "company" and str(cr["customer_id"]) == user["id"]:
        company = await db.companies.find_one({"_id": oid(other)})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "message", f"New message on '{cr['title']}'", "/custom-orders")
    else:
        await notify(oid(other), "message", f"New message on '{cr['title']}'", "/custom-orders")
    return msg


@router.post("/custom-requests/{cr_id}/counter")
async def counter_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "estimated":
        raise HTTPException(400, "Request not open to negotiation")
    body = await request.json()
    cost = float(body.get("cost", 0))
    if cost <= 0:
        raise HTTPException(400, "Counter price required")
    history = cr.get("history", []) + [{"status": "counter", "at": datetime.now(timezone.utc).isoformat(),
                                        "by": user["name"], "cost": cost,
                                        "message": body.get("message", "")}]
    await db.custom_requests.update_one({"_id": cr["_id"]},
                                        {"$set": {"status": "sent_to_creator", "history": history,
                                                  "counter": {"cost": cost, "by": user["name"]}}})
    if cr["target_type"] == "company":
        company = await db.companies.find_one({"_id": oid(cr["target_id"])})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "custom_request", f"Counter offer ₹{cost:,.0f} on '{cr['title']}'", "/custom-orders")
    else:
        await notify(oid(cr["target_id"]), "custom_request", f"Counter offer ₹{cost:,.0f} on '{cr['title']}'", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))
