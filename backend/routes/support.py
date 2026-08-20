from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/tickets")
async def create_ticket(request: Request, user=Depends(current_user)):
    body = await request.json()
    doc = {"user_id": oid(user["id"]), "user_name": user["name"], "subject": body["subject"],
           "category": body.get("category", "general"), "status": "open",
           "messages": [{"from": user["name"], "text": body["message"],
                         "at": datetime.now(timezone.utc).isoformat(), "staff": False}],
           "created_at": datetime.now(timezone.utc)}
    res = await db.tickets.insert_one(doc)
    return pub(await db.tickets.find_one({"_id": res.inserted_id}))


@router.get("/tickets")
async def list_tickets(user=Depends(current_user)):
    query = {} if user["role"] in STAFF_ROLES else {"user_id": oid(user["id"])}
    tickets = await db.tickets.find(query).sort("created_at", -1).to_list(200)
    return [pub(t) for t in tickets]


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, request: Request, user=Depends(current_user)):
    ticket = await db.tickets.find_one({"_id": oid(ticket_id)})
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    is_staff = user["role"] in STAFF_ROLES
    if not is_staff and str(ticket["user_id"]) != user["id"]:
        raise HTTPException(403, "Not your ticket")
    body = await request.json()
    msg = {"from": user["name"], "text": body["text"],
           "at": datetime.now(timezone.utc).isoformat(), "staff": is_staff}
    await db.tickets.update_one({"_id": ticket["_id"]},
                                {"$push": {"messages": msg},
                                 "$set": {"status": "answered" if is_staff else "open"}})
    if is_staff:
        await notify(ticket["user_id"], "support", f"Support replied to '{ticket['subject']}'", "/support")
    return pub(await db.tickets.find_one({"_id": ticket["_id"]}))


@router.put("/tickets/{ticket_id}/status")
async def ticket_status(ticket_id: str, request: Request, user=Depends(require(*STAFF_ROLES))):
    body = await request.json()
    if body.get("status") not in {"open", "answered", "resolved", "closed"}:
        raise HTTPException(400, "Invalid status")
    await db.tickets.update_one({"_id": oid(ticket_id)}, {"$set": {"status": body["status"]}})
    return pub(await db.tickets.find_one({"_id": oid(ticket_id)}))


@router.post("/users/me/addresses/{addr_id}/default")
async def set_default_address(addr_id: str, user=Depends(current_user)):
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"addresses.$[].is_default": False}})
    res = await db.users.update_one({"_id": oid(user["id"]), "addresses.id": addr_id},
                                    {"$set": {"addresses.$.is_default": True}})
    if not res.matched_count:
        raise HTTPException(404, "Address not found")
    return {"ok": True}
