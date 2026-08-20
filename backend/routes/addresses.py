

from deps import (
    ALLOWED_SETTINGS,
    APIRouter,
    Depends,
    HTTPException,
    ObjectId,
    Request,
    _razorpay,  # noqa: F401
    current_user,
    db,
    oid,
    pub,
    public_user,
    uuid,
    validate_address,
)

router = APIRouter()


@router.get("/users/me/addresses")
async def list_addresses(user=Depends(current_user)):
    doc = await db.users.find_one({"_id": oid(user["id"])})
    return doc.get("addresses", [])


@router.post("/users/me/addresses")
async def add_address(request: Request, user=Depends(current_user)):
    body = validate_address(await request.json())
    addr = {k: str(body.get(k, "")).strip() for k in
            ["label", "full_name", "mobile", "house", "area", "landmark", "city", "state", "pin", "country"]}
    addr["label"] = addr["label"] or "Home"
    addr["country"] = addr["country"] or "India"
    addr["id"] = uuid.uuid4().hex[:10]
    addr["is_default"] = False
    existing = await db.users.find_one({"_id": oid(user["id"])})
    if not (existing or {}).get("addresses"):
        addr["is_default"] = True
    await db.users.update_one({"_id": oid(user["id"])}, {"$push": {"addresses": addr}})
    return addr


@router.put("/users/me/addresses/{addr_id}")
async def edit_address(addr_id: str, request: Request, user=Depends(current_user)):
    body = validate_address(await request.json(), partial=True)
    update = {f"addresses.$.{k}": str(v).strip() for k, v in body.items()
              if k in {"label", "full_name", "mobile", "house", "area", "landmark", "city", "state", "pin", "country"}}
    if not update:
        raise HTTPException(400, "At least one address field is required")
    res = await db.users.update_one({"_id": oid(user["id"]), "addresses.id": addr_id}, {"$set": update})
    if not res.matched_count:
        raise HTTPException(404, "Address not found")
    return {"ok": True}


@router.delete("/users/me/addresses/{addr_id}")
async def delete_address(addr_id: str, user=Depends(current_user)):
    await db.users.update_one({"_id": oid(user["id"])}, {"$pull": {"addresses": {"id": addr_id}}})
    return {"ok": True}


@router.post("/users/me/become-retailer")
async def become_retailer(user=Depends(current_user)):
    if user["role"] != "customer":
        raise HTTPException(400, "Only customer accounts can convert to retailer")
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"role": "retailer"}})
    return {"ok": True, "role": "retailer"}


@router.put("/users/me/settings")
async def update_settings(request: Request, user=Depends(current_user)):
    body = await request.json()
    clean = {k: v for k, v in body.items() if k in ALLOWED_SETTINGS}
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"settings": clean}})
    return {"ok": True}


@router.get("/users/{user_id}/reviews")
async def user_reviews(user_id: str):
    prods = await db.products.find({"seller_id": oid(user_id)}).to_list(500)
    out = []
    for p in prods:
        for r in p.get("reviews", []):
            uid = r.get("user_id")
            out.append({**r, "user_id": str(uid) if isinstance(uid, ObjectId) else uid,
                        "product_title": p["title"], "product_id": str(p["_id"])})
    out.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return out[:50]


@router.get("/creators/recommended")
async def recommended_creators():
    pipeline = [
        {"$match": {"role": {"$in": ["artist", "company_owner", "retailer"]}, "status": "active"}},
        {"$addFields": {"follower_count": {"$size": {"$ifNull": ["$followers", []]}}}},
        {"$sort": {"follower_count": -1}}, {"$limit": 10},
    ]
    users = await db.users.aggregate(pipeline).to_list(10)
    out = []
    for u in users:
        p = public_user(u)
        p["follower_count"] = u["follower_count"]
        p.pop("followers", None)
        p.pop("following", None)
        out.append(p)
    return out


@router.get("/creators")
async def search_creators(q: str = "", role: str = ""):
    query = {"role": {"$in": ["artist", "retailer", "company_owner"]}, "status": "active"}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"specialty": {"$regex": q, "$options": "i"}}]
    if role:
        query["role"] = role
    users = await db.users.find(query).limit(40).to_list(40)
    out = []
    for u in users:
        p = public_user(u)
        p["follower_count"] = len(u.get("followers", []))
        p.pop("followers", None)
        p.pop("following", None)
        out.append(p)
    companies = await db.companies.find(
        {"name": {"$regex": q, "$options": "i"}} if q else {}).limit(20).to_list(20)
    return {"creators": out, "companies": [pub(c) for c in companies]}
