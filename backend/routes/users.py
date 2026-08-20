

from deps import (
    COURIERS,
    APIRouter,
    Depends,
    HTTPException,
    Request,
    _razorpay,  # noqa: F401
    current_user,
    db,
    get_current_user,
    notify,
    oid,
    pub,
    public_user,
    re,
)

router = APIRouter()


@router.put("/users/me")
async def update_profile(request: Request, user=Depends(current_user)):
    body = await request.json()
    allowed = {"name", "bio", "avatar", "banner", "specialty", "mobile", "courier_preference",
               "username", "website", "location"}
    update = {k: v for k, v in body.items() if k in allowed}
    if update.get("courier_preference") and update["courier_preference"] not in COURIERS:
        raise HTTPException(400, "Invalid courier")
    if "username" in update:
        uname = re.sub(r"[^a-z0-9_]", "", str(update["username"]).lower())[:20]
        if not uname:
            raise HTTPException(400, "Invalid username")
        clash = await db.users.find_one({"username": uname, "_id": {"$ne": oid(user["id"])}})
        if clash:
            raise HTTPException(400, "Username taken")
        update["username"] = uname
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": update})
    return public_user(await db.users.find_one({"_id": oid(user["id"])}))


@router.get("/users/{user_id}")
async def get_profile(user_id: str, request: Request):
    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        company = await db.companies.find_one({"_id": oid(user_id)})
        if not company:
            raise HTTPException(404, "Not found")
        return {"type": "company", **pub(company)}
    me = None
    try:
        me = await get_current_user(request, db)
    except HTTPException:
        pass
    u = public_user(user)
    u["type"] = "user"
    u["follower_count"] = len(user.get("followers", []))
    u["following_count"] = len(user.get("following", []))
    u["is_following"] = bool(me and oid(me["id"]) in user.get("followers", []))
    u.pop("followers", None)
    u.pop("following", None)
    await db.users.update_one({"_id": user["_id"]}, {"$inc": {"profile_views": 1}})
    u["orders_completed"] = await db.orders.count_documents({"items.seller_id": user["_id"], "status": "delivered"})
    u["portfolio_views"] = user.get("profile_views", 0) + 1
    if user.get("company_id"):
        comp = await db.companies.find_one({"_id": user["company_id"]})
        if comp:
            u["company"] = {"id": str(comp["_id"]), "name": comp["name"]}
    return u


@router.post("/users/{user_id}/follow")
async def toggle_follow(user_id: str, user=Depends(current_user)):
    target = oid(user_id)
    me_id = oid(user["id"])
    target_user = await db.users.find_one({"_id": target})
    if not target_user:
        raise HTTPException(404, "User not found")
    if me_id in target_user.get("followers", []):
        await db.users.update_one({"_id": target}, {"$pull": {"followers": me_id}})
        await db.users.update_one({"_id": me_id}, {"$pull": {"following": target}})
        return {"following": False}
    await db.users.update_one({"_id": target}, {"$addToSet": {"followers": me_id}})
    await db.users.update_one({"_id": me_id}, {"$addToSet": {"following": target}})
    await notify(target, "follow", f"{user['name']} started following you", f"/profile/{user['id']}")
    return {"following": True}


@router.get("/users/{user_id}/followers")
async def get_followers(user_id: str):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    out = []
    for fid in target.get("followers", [])[-100:]:
        u = await db.users.find_one({"_id": fid})
        if u:
            p = public_user(u)
            p.pop("followers", None)
            p.pop("following", None)
            out.append(p)
    return out


@router.get("/users/{user_id}/following")
async def get_following(user_id: str):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    out = []
    for fid in target.get("following", [])[-100:]:
        u = await db.users.find_one({"_id": fid})
        if u:
            p = public_user(u)
            p.pop("followers", None)
            p.pop("following", None)
            out.append(p)
    return out


@router.delete("/users/me/followers/{follower_id}")
async def remove_follower(follower_id: str, user=Depends(current_user)):
    fid = oid(follower_id)
    await db.users.update_one({"_id": oid(user["id"])}, {"$pull": {"followers": fid}})
    await db.users.update_one({"_id": fid}, {"$pull": {"following": oid(user["id"])}})
    return {"ok": True}
