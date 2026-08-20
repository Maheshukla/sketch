

from deps import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    _razorpay,  # noqa: F401
    current_user,
    db,
    oid,
    pub,
)

router = APIRouter()


@router.get("/cart")
async def get_cart(user=Depends(current_user)):
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    items = []
    if cart:
        for it in cart.get("items", []):
            prod = await db.products.find_one({"_id": it["product_id"]})
            if prod:
                disc = prod.get("discount_pct", 0)
                delta = next((v.get("delta", 0) for v in prod.get("variations", []) if v.get("name") == it.get("variation")), 0)
                final_price = round(prod["price"] * (1 - disc / 100) + delta, 2)
                items.append({**pub(prod), "qty": it["qty"], "saved": it.get("saved", False),
                              "variation": it.get("variation", ""), "final_price": final_price})
    return {"items": items}


@router.post("/cart")
async def add_to_cart(request: Request, user=Depends(current_user)):
    body = await request.json()
    pid = oid(body["product_id"])
    qty = max(1, int(body.get("qty", 1)))
    variation = body.get("variation", "")
    prod = await db.products.find_one({"_id": pid})
    if not prod:
        raise HTTPException(404, "Product not found")
    if variation and variation not in [v.get("name") for v in prod.get("variations", [])]:
        raise HTTPException(400, "Invalid variation")
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    match = None
    if cart:
        match = next((i for i in cart.get("items", []) if i["product_id"] == pid and i.get("variation", "") == variation and not i.get("saved")), None)
    if match:
        await db.carts.update_one(
            {"user_id": oid(user["id"])},
            {"$inc": {"items.$[elem].qty": qty}},
            array_filters=[{"elem.product_id": pid, "elem.variation": variation, "elem.saved": {"$ne": True}}])
    else:
        await db.carts.update_one({"user_id": oid(user["id"])},
                                  {"$push": {"items": {"product_id": pid, "qty": qty, "variation": variation}}}, upsert=True)
    return {"ok": True}


@router.put("/cart/{product_id}")
async def update_cart_item(product_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    qty = int(body.get("qty", 1))
    if qty <= 0:
        await db.carts.update_one({"user_id": oid(user["id"])},
                                  {"$pull": {"items": {"product_id": oid(product_id)}}})
    else:
        await db.carts.update_one({"user_id": oid(user["id"]), "items.product_id": oid(product_id)},
                                  {"$set": {"items.$.qty": qty}})
    return {"ok": True}


@router.delete("/cart/{product_id}")
async def remove_cart_item(product_id: str, user=Depends(current_user)):
    await db.carts.update_one({"user_id": oid(user["id"])},
                              {"$pull": {"items": {"product_id": oid(product_id)}}})
    return {"ok": True}


@router.put("/cart/{product_id}/save-for-later")
async def toggle_save_for_later(product_id: str, user=Depends(current_user)):
    pid = oid(product_id)
    cart = await db.carts.find_one({"user_id": oid(user["id"]), "items.product_id": pid})
    if not cart:
        raise HTTPException(404, "Item not in cart")
    item = next(i for i in cart["items"] if i["product_id"] == pid)
    await db.carts.update_one({"user_id": oid(user["id"]), "items.product_id": pid},
                              {"$set": {"items.$.saved": not item.get("saved", False)}})
    return {"saved": not item.get("saved", False)}


@router.get("/wishlist")
async def get_wishlist(user=Depends(current_user)):
    wl = await db.wishlists.find_one({"user_id": oid(user["id"])})
    items = []
    if wl:
        for pid in wl.get("product_ids", []):
            prod = await db.products.find_one({"_id": pid})
            if prod:
                items.append(pub(prod))
    return {"items": items}


@router.post("/wishlist/{product_id}")
async def toggle_wishlist(product_id: str, user=Depends(current_user)):
    pid = oid(product_id)
    wl = await db.wishlists.find_one({"user_id": oid(user["id"])})
    if wl and pid in wl.get("product_ids", []):
        await db.wishlists.update_one({"user_id": oid(user["id"])}, {"$pull": {"product_ids": pid}})
        return {"wishlisted": False}
    await db.wishlists.update_one({"user_id": oid(user["id"])},
                                  {"$addToSet": {"product_ids": pid}}, upsert=True)
    return {"wishlisted": True}
