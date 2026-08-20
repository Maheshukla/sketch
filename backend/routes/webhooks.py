from fastapi import APIRouter

from deps import *
from deps import _razorpay

router = APIRouter()


@router.post("/payments/webhook")
async def razorpay_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    if not (_razorpay and RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(503, "Razorpay not configured")
    if not secret or not signature:
        raise HTTPException(400, "Missing webhook signature")
    try:
        rzp = _razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        rzp.utility.verify_webhook_signature(payload.decode(), signature, secret)
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")
    event = json.loads(payload)
    etype = event.get("event", "")
    wrapper = event.get("payload", {})
    entity = (wrapper.get("payment") or wrapper.get("refund") or {}).get("entity", {})
    rzp_order_id = entity.get("order_id") or ""
    if etype == "payment.captured" and rzp_order_id:
        po = await db.payment_orders.find_one({"order_id": rzp_order_id, "status": "created"})
        if po:
            await db.payment_orders.update_one({"_id": po["_id"]}, {"$set": {"status": "paid"}})
            existing = await db.payments.find_one({"order_id": rzp_order_id})
            if not existing:
                await db.payments.insert_one({
                    "payment_id": entity.get("id", ""), "order_id": rzp_order_id,
                    "user_id": po["user_id"], "amount": po["amount"], "purpose": po["purpose"],
                    "ref_id": po.get("ref_id", ""), "method": entity.get("method", ""),
                    "escrow": "held", "via": "webhook", "created_at": datetime.now(timezone.utc),
                })
    elif etype == "payment.failed" and rzp_order_id:
        res = await db.payment_orders.update_many(
            {"order_id": rzp_order_id, "status": "created"},
            {"$set": {"status": "failed", "failed_reason": entity.get("error_description", "failed")}})
        if res.modified_count:
            po = await db.payment_orders.find_one({"order_id": rzp_order_id})
            if po and po.get("purpose") == "order" and po.get("ref_id"):
                await db.orders.update_one({"_id": oid(po["ref_id"])}, {"$set": {"payment_status": "failed"}})
    elif etype.startswith("refund"):
        pid = entity.get("payment_id", "")
        if pid:
            await db.payments.update_many(
                {"payment_id": pid, "escrow": "held"},
                {"$set": {"escrow": "refunded", "refunded_at": datetime.now(timezone.utc),
                          "refund_id": entity.get("id", "")}})
    await db.audit_logs.insert_one({
        "actor_id": "razorpay_webhook", "actor_name": "Razorpay", "action": f"webhook_{etype or 'unknown'}",
        "target": rzp_order_id or entity.get("payment_id", ""), "meta": {"event": etype},
        "at": datetime.now(timezone.utc)})
    return {"status": "processed"}
