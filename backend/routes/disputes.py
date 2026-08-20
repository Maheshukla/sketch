from fastapi import APIRouter

from deps import *
from deps import _razorpay

router = APIRouter()


@router.get("/admin/disputes")
async def admin_disputes(user=Depends(require(*STAFF_ROLES))):
    orders = await db.orders.find({"dispute.status": "open"}).sort("created_at", -1).to_list(200)
    for o in orders:
        buyer = await db.users.find_one({"_id": o["buyer_id"]})
        o["buyer_name"] = buyer["name"] if buyer else ""
    return [pub(o) for o in orders]


@router.post("/admin/orders/{order_id}/resolve-dispute")
async def resolve_dispute(order_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    action = body.get("action", "")
    if action not in {"refund", "reject"}:
        raise HTTPException(400, "Invalid action")
    note = (body.get("note") or "").strip()
    order = await db.orders.find_one({"_id": oid(order_id), "dispute.status": "open"})
    if not order:
        raise HTTPException(404, "Open dispute not found")
    update = {"dispute.status": "resolved", "dispute.resolved_by": user["name"],
              "dispute.resolution": action, "dispute.note": note,
              "dispute.resolved_at": datetime.now(timezone.utc)}
    if action == "refund":
        held = await db.payments.find({"ref_id": order_id, "purpose": "order", "escrow": "held"}).to_list(10)
        for p in held:
            rid = ""
            pid = str(p.get("payment_id", ""))
            if _razorpay and pid.startswith("pay_") and not pid.startswith("pay_mock"):
                try:
                    rzp = _razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
                    ref = rzp.payment.refund(pid, {"amount": int(round(float(p["amount"]) * 100))})
                    rid = ref.get("id", "")
                except Exception as e:
                    logger.error(f"Razorpay refund failed for {pid}: {e}")
            await db.payments.update_one({"_id": p["_id"]}, {"$set": {
                "escrow": "refunded", "refunded_at": datetime.now(timezone.utc),
                "refund_id": rid, "refund_note": note}})
        update["status"] = "refunded"
        update["payment_status"] = "refunded"
        await notify(order["buyer_id"], "order", f"Dispute resolved — refund initiated for order #{order_id[-8:]}", f"/orders/{order_id}")
    else:
        update["status"] = order.get("prev_status", "placed")
        await notify(order["buyer_id"], "order", f"Dispute reviewed and closed for order #{order_id[-8:]}", f"/orders/{order_id}")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": update})
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "order", f"Dispute on order #{order_id[-8:]} resolved ({action})", f"/orders/{order_id}")
    await audit(user, f"dispute_{action}", order_id, {"note": note})
    return pub(await db.orders.find_one({"_id": order["_id"]}))
