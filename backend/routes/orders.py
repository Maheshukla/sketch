

from deps import (
    ADMIN_ROLES,
    COURIER_RATES,
    COURIERS,
    ORDER_TRANSITIONS,
    SHIPPING_FLAT,
    STAFF_ROLES,
    APIRouter,
    Depends,
    HTTPException,
    Request,
    _razorpay,  # noqa: F401
    audit,
    current_user,
    datetime,
    db,
    fee_breakdown,
    format_address,
    notify,
    oid,
    pub,
    release_escrow,
    timezone,
    uuid,
)

router = APIRouter()


@router.post("/orders/checkout")
async def checkout(request: Request, user=Depends(current_user)):
    body = await request.json()
    method = body.get("payment_method", "upi")
    if method not in {"upi", "card", "netbanking", "wallet"}:
        raise HTTPException(400, "Invalid payment method")
    address = body.get("address", "")
    addr_snapshot = None
    addr_id = body.get("address_id", "")
    if addr_id:
        me_doc = await db.users.find_one({"_id": oid(user["id"])})
        addr = next((a for a in (me_doc or {}).get("addresses", []) if a["id"] == addr_id), None)
        if not addr:
            raise HTTPException(400, "Address not found")
        address = format_address(addr)
        addr_snapshot = addr
    if not address:
        raise HTTPException(400, "Delivery address required")
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    if not cart or not cart.get("items"):
        raise HTTPException(400, "Cart is empty")
    items = []
    subtotal = 0.0
    has_physical = False
    for it in cart["items"]:
        if it.get("saved"):
            continue
        prod = await db.products.find_one({"_id": it["product_id"]})
        if not prod or prod["status"] != "approved":
            continue
        if prod["product_type"] == "physical" and prod["stock"] < it["qty"]:
            raise HTTPException(400, f"Insufficient stock for {prod['title']}")
        delta = next((v.get("delta", 0) for v in prod.get("variations", []) if v.get("name") == it.get("variation")), 0)
        price = round(prod["price"] * (1 - prod.get("discount_pct", 0) / 100) + delta, 2)
        subtotal += price * it["qty"]
        has_physical = has_physical or prod["product_type"] == "physical"
        items.append({"product_id": prod["_id"], "title": prod["title"], "price": price,
                      "qty": it["qty"], "variation": it.get("variation", ""),
                      "seller_id": prod["seller_id"], "seller_name": prod["seller_name"],
                      "product_type": prod["product_type"],
                      "image": prod["images"][0] if prod.get("images") else ""})
    if not items:
        raise HTTPException(400, "Cart is empty")
    fees = fee_breakdown(subtotal, has_physical)
    order = {
        "buyer_id": oid(user["id"]), "buyer_name": user["name"], "items": items,
        **fees, "payment_method": method, "status": "payment_pending",
        "payment_status": "pending",
        "address": address, "address_snapshot": addr_snapshot or {"raw": address},
        "courier": "", "tracking_id": "",
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.orders.insert_one(order)
    return {"order": pub(await db.orders.find_one({"_id": res.inserted_id}))}


@router.post("/orders/{order_id}/pay")
async def pay_order(order_id: str, request: Request, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id), "buyer_id": oid(user["id"])})
    if not order or order["status"] != "payment_pending":
        raise HTTPException(400, "Order not payable")
    body = await request.json()
    payment_db_id = body.get("payment_db_id", "")
    payment = await db.payments.find_one({"_id": oid(payment_db_id), "ref_id": order_id, "escrow": "held"})
    if not payment:
        raise HTTPException(400, "Payment not found")
    for it in order["items"]:
        await db.products.update_one({"_id": it["product_id"]},
                                     {"$inc": {"stock": -it["qty"] if it["product_type"] == "physical" else 0,
                                               "sales": it["qty"]}})
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "placed", "payment_status": "paid", "paid_at": datetime.now(timezone.utc)}})
    await db.carts.update_one({"user_id": oid(user["id"])}, {"$pull": {"items": {"saved": {"$ne": True}}}})
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "order", f"New order received from {user['name']}", "/orders")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@router.get("/orders")
async def my_orders(user=Depends(current_user)):
    orders = await db.orders.find({"buyer_id": oid(user["id"]), "status": {"$ne": "payment_pending"}}).sort("created_at", -1).to_list(100)
    return [pub(o) for o in orders]


@router.get("/orders/seller")
async def seller_orders(user=Depends(current_user)):
    seller_ids = [oid(user["id"])]
    if user.get("company_id"):
        seller_ids.append(oid(user["company_id"]))
    orders = await db.orders.find({"items.seller_id": {"$in": seller_ids}, "status": {"$ne": "payment_pending"}}).sort("created_at", -1).to_list(200)
    out = []
    for o in orders:
        o["items"] = [i for i in o["items"] if i["seller_id"] in seller_ids]
        out.append(pub(o))
    return out


@router.post("/orders/{order_id}/ship")
async def ship_order(order_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    courier = body.get("courier", "")
    if courier not in COURIERS:
        raise HTTPException(400, "Select a valid courier partner")
    order = await db.orders.find_one({"_id": oid(order_id)})
    if not order or order["status"] != "placed":
        raise HTTPException(400, "Order cannot be shipped")
    seller_ids = {user["id"], user.get("company_id", "")}
    if not any(str(i["seller_id"]) in seller_ids for i in order["items"]) and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your order")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {
        "status": "shipped", "courier": courier, "tracking_id": body.get("tracking_id", ""),
        "shipped_at": datetime.now(timezone.utc),
        "shipping": {
            "provider": courier,
            "shipment_id": f"SHP-{uuid.uuid4().hex[:10].upper()}",
            "tracking_number": body.get("tracking_id", ""),
            "pickup_status": "scheduled",
            "shipping_charge": COURIER_RATES.get(courier, SHIPPING_FLAT),
            "delivery_status": "in_transit",
            "tracking_url": f"https://track.{courier.lower().replace(' ', '')}.in/{body.get('tracking_id', '')}" if body.get("tracking_id") else "",
        }}})
    await notify(order["buyer_id"], "order", f"Your order shipped via {courier}", "/orders")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@router.post("/orders/{order_id}/deliver")
async def deliver_order(order_id: str, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id), "buyer_id": oid(user["id"])})
    if not order or order["status"] != "shipped":
        raise HTTPException(400, "Order cannot be marked delivered")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc)}})
    await release_escrow(order_id, "order")
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "payment", "Escrow released — payment credited", "/dashboard")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@router.post("/orders/{order_id}/status")
async def update_order_status(order_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    action = body.get("action", "")
    if action not in ORDER_TRANSITIONS:
        raise HTTPException(400, "Invalid action")
    order = await db.orders.find_one({"_id": oid(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")
    from_states, to_state, actor = ORDER_TRANSITIONS[action]
    if isinstance(from_states, str):
        from_states = (from_states,)
    is_buyer = str(order["buyer_id"]) == user["id"]
    seller_ids = {user["id"], user.get("company_id", "")}
    is_seller = any(str(i["seller_id"]) in seller_ids for i in order["items"]) or user["role"] in ADMIN_ROLES
    if actor == "buyer" and not is_buyer:
        raise HTTPException(403, "Only the buyer can do this")
    if actor == "seller" and not is_seller:
        raise HTTPException(403, "Only the seller can do this")
    if order["status"] not in from_states:
        raise HTTPException(400, f"Order cannot move from {order['status']} via {action}")
    update = {"status": to_state, f"{to_state}_at": datetime.now(timezone.utc)}
    if action == "shipped":
        courier = body.get("courier", "")
        if courier not in COURIERS:
            raise HTTPException(400, "Select a valid courier partner")
        tracking = body.get("tracking_id", "")
        charge = float(body.get("shipping_charge") or COURIER_RATES.get(courier, SHIPPING_FLAT))
        update["courier"] = courier
        update["tracking_id"] = tracking
        update["shipping"] = {
            "provider": courier,
            "shipment_id": f"SHP-{uuid.uuid4().hex[:10].upper()}",
            "tracking_number": tracking,
            "pickup_status": body.get("pickup_status", "scheduled"),
            "shipping_charge": charge,
            "delivery_status": "in_transit",
            "tracking_url": f"https://track.{courier.lower().replace(' ', '')}.in/{tracking}" if tracking else "",
        }
    if action == "picked_up":
        update["shipping.pickup_status"] = "picked_up"
        update["shipping.picked_up_at"] = datetime.now(timezone.utc)
    if action == "reject":
        await db.payments.update_many({"ref_id": order_id, "purpose": "order", "escrow": "held"},
                                      {"$set": {"escrow": "refunded", "refunded_at": datetime.now(timezone.utc)}})
        update["payment_status"] = "refunded"
    if action == "delivered":
        await release_escrow(order_id, "order")
        update["shipping.delivery_status"] = "delivered"
    await db.orders.update_one({"_id": order["_id"]}, {"$set": update})
    if actor == "seller":
        await notify(order["buyer_id"], "order", f"Order update: {to_state.replace('_', ' ')}", f"/orders/{order_id}")
    else:
        for sid in {str(i["seller_id"]) for i in order["items"]}:
            await notify(sid, "order", f"Order {to_state.replace('_', ' ')} by customer", f"/orders/{order_id}")
    await audit(user, f"order_{action}", order_id, {"from": order["status"], "to": to_state})
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@router.post("/orders/{order_id}/dispute")
async def raise_dispute(order_id: str, request: Request, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id), "buyer_id": oid(user["id"])})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["status"] not in {"placed", "accepted", "processing", "shipped", "out_for_delivery", "delivered"}:
        raise HTTPException(400, "Order cannot be disputed in its current state")
    body = await request.json()
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Dispute reason required")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {
        "prev_status": order["status"], "status": "disputed",
        "dispute": {"reason": reason, "by": user["name"], "at": datetime.now(timezone.utc), "status": "open"}}})
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "order", f"Dispute raised on order #{order_id[-8:]}", f"/orders/{order_id}")
    await audit(user, "order_dispute_raised", order_id, {"reason": reason})
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@router.get("/orders/{order_id}")
async def order_detail(order_id: str, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id)})
    if not order:
        raise HTTPException(404, "Order not found")
    seller_ids = {user["id"], user.get("company_id", "")}
    is_buyer = str(order["buyer_id"]) == user["id"]
    is_seller = any(str(i["seller_id"]) in seller_ids for i in order["items"])
    if not is_buyer and not is_seller and user["role"] not in STAFF_ROLES:
        raise HTTPException(403, "Not your order")
    out = pub(order)
    payment = await db.payments.find_one({"ref_id": order_id, "purpose": "order"})
    out["payment"] = pub(payment) if payment else None
    timeline = []
    for field, label in [("created_at", "Order placed"), ("paid_at", "Payment confirmed"),
                         ("accepted_at", "Accepted by seller"), ("processing_at", "Preparing"),
                         ("shipped_at", "Shipped"), ("out_for_delivery_at", "Out for delivery"),
                         ("delivered_at", "Delivered"), ("completed_at", "Completed"),
                         ("cancelled_at", "Cancelled")]:
        if order.get(field):
            timeline.append({"label": label, "at": order[field]})
    out["timeline"] = timeline
    return out
