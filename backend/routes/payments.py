from fastapi import APIRouter

from deps import *
from deps import _razorpay

router = APIRouter()


@router.post("/payments/create")
async def create_payment(request: Request, user=Depends(current_user)):
    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "Invalid amount")
    order = {
        "amount": amount, "currency": "INR", "purpose": body.get("purpose", "order"),
        "ref_id": body.get("ref_id", ""), "user_id": oid(user["id"]),
        "status": "created", "created_at": datetime.now(timezone.utc),
    }
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and _razorpay:
        rzp = _razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
        rzp_order = rzp.order.create({"amount": int(round(amount * 100)), "currency": "INR",
                                      "receipt": f"sk_{uuid.uuid4().hex[:12]}"})
        order["order_id"] = rzp_order["id"]
        order["gateway"] = "razorpay"
        await db.payment_orders.insert_one(order)
        out = pub(order)
        out["razorpay"] = True
        out["key_id"] = RAZORPAY_KEY_ID
        return out
    order["order_id"] = f"order_mock_{uuid.uuid4().hex[:16]}"
    order["gateway"] = "mock"
    await db.payment_orders.insert_one(order)
    return pub(order)


@router.post("/payments/verify")
async def verify_payment(request: Request, user=Depends(current_user)):
    body = await request.json()
    order = await db.payment_orders.find_one({"order_id": body.get("order_id", "")})
    if not order or order["status"] != "created":
        raise HTTPException(400, "Invalid payment order")
    if order.get("gateway") == "razorpay":
        try:
            rzp = _razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
            rzp.utility.verify_payment_signature({
                "razorpay_order_id": order["order_id"],
                "razorpay_payment_id": body.get("razorpay_payment_id", ""),
                "razorpay_signature": body.get("razorpay_signature", ""),
            })
        except Exception:
            raise HTTPException(400, "Payment signature verification failed")
        payment_id = body["razorpay_payment_id"]
    else:
        # MOCKED gateway: always succeeds. Set RAZORPAY_KEY_ID/SECRET to enable live Razorpay checkout.
        payment_id = f"pay_mock_{uuid.uuid4().hex[:14]}"
    await db.payment_orders.update_one({"_id": order["_id"]}, {"$set": {"status": "paid"}})
    await audit(user, "payment_paid", order["order_id"], {"amount": order["amount"], "purpose": order["purpose"]})
    pres = await db.payments.insert_one({
        "payment_id": payment_id, "order_id": order["order_id"], "user_id": oid(user["id"]),
        "amount": order["amount"], "purpose": order["purpose"], "ref_id": order.get("ref_id", ""),
        "method": body.get("method", "upi"), "escrow": "held",
        "created_at": datetime.now(timezone.utc),
    })
    return {"payment_id": payment_id, "id": str(pres.inserted_id), "status": "held", "ref_id": order.get("ref_id", ""), "purpose": order["purpose"]}


@router.post("/payments/fail")
async def fail_payment(request: Request, user=Depends(current_user)):
    body = await request.json()
    order = await db.payment_orders.find_one({"order_id": body.get("order_id", ""), "status": "created"})
    if not order:
        raise HTTPException(400, "Payment order not found")
    await db.payment_orders.update_one({"_id": order["_id"]},
                                       {"$set": {"status": "failed", "failed_reason": body.get("reason", "")}})
    if order.get("purpose") == "order" and order.get("ref_id"):
        await db.orders.update_one({"_id": oid(order["ref_id"])},
                                   {"$set": {"payment_status": "failed"}})
    return {"ok": True, "status": "failed"}
