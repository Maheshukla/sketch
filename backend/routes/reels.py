from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/reels")
async def create_reel(data: ReelIn, user=Depends(require("artist", "company_owner", "company_admin", "company_artist", "retailer"))):
    if data.media_type not in {"image", "video"}:
        raise HTTPException(400, "media_type must be image or video")
    hashtags = list({t.lower() for t in re.findall(r"#(\w+)", data.caption)})
    doc = {
        "caption": data.caption, "media_url": data.media_url, "media_type": data.media_type,
        "hashtags": hashtags,
        "creator_id": oid(user["id"]), "creator_name": user["name"], "creator_avatar": user.get("avatar", ""),
        "likes": [], "saves": [], "shares": 0, "comments": [],
        "status": "pending", "created_at": datetime.now(timezone.utc),
    }
    if data.product_id:
        doc["product_id"] = oid(data.product_id)
    res = await db.reels.insert_one(doc)
    return pub(await db.reels.find_one({"_id": res.inserted_id}))


@router.get("/reels")
async def feed(request: Request, saved: bool = False, creator_id: str = "", hashtag: str = "",
               sort: str = "", skip: int = 0, limit: int = 50):
    query = {"status": "approved"}
    if creator_id:
        query["creator_id"] = oid(creator_id)
    if hashtag:
        query["hashtags"] = hashtag.lower().lstrip("#")
    me = None
    try:
        me = await get_current_user(request, db)
    except HTTPException:
        pass
    if saved and me:
        query["saves"] = oid(me["id"])
    reels = await db.reels.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    if sort == "popular":
        reels.sort(key=lambda r: len(r.get("likes", [])), reverse=True)
    elif sort == "random":
        random.shuffle(reels)
    out = []
    for r in reels:
        item = pub(r)
        item["like_count"] = len(r.get("likes", []))
        item["save_count"] = len(r.get("saves", []))
        item["comment_count"] = len(r.get("comments", []))
        item["liked"] = bool(me and oid(me["id"]) in r.get("likes", []))
        item["saved"] = bool(me and oid(me["id"]) in r.get("saves", []))
        if r.get("product_id"):
            prod = await db.products.find_one({"_id": r["product_id"]})
            if prod:
                item["product"] = {"id": str(prod["_id"]), "title": prod["title"], "price": prod["price"],
                                   "image": prod["images"][0] if prod.get("images") else ""}
        out.append(item)
    return out


@router.post("/reels/{reel_id}/like")
async def like_reel(reel_id: str, user=Depends(current_user)):
    rid, uid = oid(reel_id), oid(user["id"])
    reel = await db.reels.find_one({"_id": rid})
    if not reel:
        raise HTTPException(404, "Reel not found")
    if uid in reel.get("likes", []):
        await db.reels.update_one({"_id": rid}, {"$pull": {"likes": uid}})
        return {"liked": False}
    await db.reels.update_one({"_id": rid}, {"$addToSet": {"likes": uid}})
    if str(reel["creator_id"]) != user["id"]:
        await notify(reel["creator_id"], "like", f"{user['name']} liked your reel", "/reels")
    return {"liked": True}


@router.post("/reels/{reel_id}/save")
async def save_reel(reel_id: str, user=Depends(current_user)):
    rid, uid = oid(reel_id), oid(user["id"])
    reel = await db.reels.find_one({"_id": rid})
    if not reel:
        raise HTTPException(404, "Reel not found")
    if uid in reel.get("saves", []):
        await db.reels.update_one({"_id": rid}, {"$pull": {"saves": uid}})
        return {"saved": False}
    await db.reels.update_one({"_id": rid}, {"$addToSet": {"saves": uid}})
    return {"saved": True}


@router.post("/reels/{reel_id}/share")
async def share_reel(reel_id: str):
    await db.reels.update_one({"_id": oid(reel_id)}, {"$inc": {"shares": 1}})
    return {"ok": True}


@router.post("/reels/{reel_id}/comments")
async def comment_reel(reel_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Comment text required")
    comment = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"],
               "text": text, "status": "approved", "created_at": datetime.now(timezone.utc).isoformat()}
    comment_for_db = {**comment, "user_id": oid(user["id"])}
    await db.reels.update_one({"_id": oid(reel_id)}, {"$push": {"comments": comment_for_db}})
    reel = await db.reels.find_one({"_id": oid(reel_id)})
    if reel and str(reel["creator_id"]) != user["id"]:
        await notify(reel["creator_id"], "comment", f"{user['name']} commented on your reel", "/reels")
    return comment


@router.get("/reels/{reel_id}/comments")
async def reel_comments(reel_id: str):
    reel = await db.reels.find_one({"_id": oid(reel_id)})
    if not reel:
        raise HTTPException(404, "Reel not found")
    return [c for c in pub(reel).get("comments", []) if c.get("status") == "approved"]
