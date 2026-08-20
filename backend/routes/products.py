from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/products")
async def create_product(data: ProductIn, user=Depends(require("artist", "retailer", "company_owner", "company_admin", "company_artist"))):
    if data.product_type not in {"physical", "digital", "software"}:
        raise HTTPException(400, "Invalid product type")
    if not await seller_verified(user):
        raise HTTPException(403, "Verification required — complete KYC before listing products")
    seller_id = oid(user["id"])
    seller_type = "user"
    seller_name = user["name"]
    if user["role"].startswith("company_") and user.get("company_id"):
        company = await db.companies.find_one({"_id": oid(user["company_id"])})
        if company:
            seller_id = company["_id"]
            seller_type = "company"
            seller_name = company["name"]
    doc = {**data.model_dump(), "seller_id": seller_id, "seller_type": seller_type,
           "seller_name": seller_name, "status": "pending", "rating": 0, "reviews": [],
           "sales": 0, "created_at": datetime.now(timezone.utc)}
    res = await db.products.insert_one(doc)
    return pub(await db.products.find_one({"_id": res.inserted_id}))


@router.get("/products")
async def list_products(q: str = "", category: str = "", product_type: str = "",
                        min_price: float = 0, max_price: float = 0, seller_id: str = "",
                        status: str = "approved", limit: int = 60):
    query = {"status": status}
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}},
                        {"description": {"$regex": q, "$options": "i"}},
                        {"tags": {"$regex": q, "$options": "i"}}]
    if category:
        query["category"] = category
    if product_type:
        query["product_type"] = product_type
    if min_price:
        query.setdefault("price", {})["$gte"] = min_price
    if max_price:
        query.setdefault("price", {})["$lte"] = max_price
    if seller_id:
        query["seller_id"] = oid(seller_id)
    items = await db.products.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [pub(i) for i in items]


@router.get("/products/trending")
async def trending_products():
    items = await db.products.find({"status": "approved"}).sort([("views", -1), ("sales", -1)]).limit(10).to_list(10)
    return [pub(i) for i in items]


@router.get("/products/recommended")
async def recommended_products():
    items = await db.products.find({"status": "approved"}).sort("sales", -1).limit(8).to_list(8)
    return [pub(i) for i in items]


@router.get("/products/{product_id}/related")
async def related_products(product_id: str):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    items = await db.products.find(
        {"status": "approved", "category": prod["category"], "_id": {"$ne": prod["_id"]}}
    ).limit(8).to_list(8)
    return [pub(i) for i in items]


@router.post("/products/{product_id}/view")
async def track_product_view(product_id: str, request: Request):
    pid = oid(product_id)
    await db.products.update_one({"_id": pid}, {"$inc": {"views": 1}})
    try:
        me = await get_current_user(request, db)
    except HTTPException:
        return {"ok": True}
    uid = oid(me["id"])
    await db.recently_viewed.update_one({"user_id": uid}, {"$pull": {"items": {"product_id": pid}}}, upsert=True)
    await db.recently_viewed.update_one(
        {"user_id": uid},
        {"$push": {"items": {"$each": [{"product_id": pid, "at": datetime.now(timezone.utc)}], "$slice": -20}}},
        upsert=True)
    return {"ok": True}


@router.get("/recently-viewed")
async def get_recently_viewed(user=Depends(current_user)):
    rv = await db.recently_viewed.find_one({"user_id": oid(user["id"])})
    items = []
    seen = set()
    for entry in reversed((rv or {}).get("items", [])):
        if entry["product_id"] in seen:
            continue
        seen.add(entry["product_id"])
        prod = await db.products.find_one({"_id": entry["product_id"]})
        if prod:
            items.append(pub(prod))
    return {"items": items}


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    return pub(prod)


@router.put("/products/{product_id}")
async def update_product(product_id: str, request: Request, user=Depends(current_user)):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    if str(prod["seller_id"]) not in {user["id"], user.get("company_id", "")} and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your product")
    body = await request.json()
    allowed = {"title", "description", "price", "stock", "images", "category", "subcategory", "tags", "product_type",
               "discount_pct", "variations"}
    await db.products.update_one({"_id": prod["_id"]}, {"$set": {k: v for k, v in body.items() if k in allowed}})
    return pub(await db.products.find_one({"_id": prod["_id"]}))


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(current_user)):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    if str(prod["seller_id"]) not in {user["id"], user.get("company_id", "")} and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your product")
    await db.products.delete_one({"_id": prod["_id"]})
    return {"ok": True}


@router.post("/products/{product_id}/reviews")
async def review_product(product_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    rating = int(body.get("rating", 5))
    if not 1 <= rating <= 5:
        raise HTTPException(400, "Rating must be 1-5")
    review = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"],
              "rating": rating, "text": body.get("text", ""),
              "created_at": datetime.now(timezone.utc).isoformat()}
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    reviews = prod.get("reviews", []) + [{**review, "user_id": oid(user["id"])}]
    avg = round(sum(r["rating"] for r in reviews) / len(reviews), 1)
    await db.products.update_one({"_id": prod["_id"]}, {"$set": {"reviews": reviews, "rating": avg}})
    return review
