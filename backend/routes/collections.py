from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/collections")
async def create_collection(request: Request, user=Depends(current_user)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Collection name required")
    doc = {"user_id": oid(user["id"]), "name": body["name"], "description": body.get("description", ""),
           "product_ids": [], "featured": False, "created_at": datetime.now(timezone.utc)}
    res = await db.collections.insert_one(doc)
    return pub(await db.collections.find_one({"_id": res.inserted_id}))


@router.get("/collections")
async def my_collections(user=Depends(current_user)):
    cols = await db.collections.find({"user_id": oid(user["id"])}).sort("created_at", -1).to_list(50)
    return [await hydrate_collection(c) for c in cols]


@router.get("/collections/featured")
async def featured_collections():
    cols = await db.collections.find({"featured": True}).limit(6).to_list(6)
    return [await hydrate_collection(c) for c in cols]


@router.get("/users/{user_id}/collections")
async def user_collections(user_id: str):
    cols = await db.collections.find({"user_id": oid(user_id)}).sort("created_at", -1).to_list(50)
    return [await hydrate_collection(c) for c in cols]


@router.post("/collections/{collection_id}/items")
async def toggle_collection_item(collection_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    pid = oid(body["product_id"])
    col = await db.collections.find_one({"_id": oid(collection_id), "user_id": oid(user["id"])})
    if not col:
        raise HTTPException(404, "Collection not found")
    if pid in col.get("product_ids", []):
        await db.collections.update_one({"_id": col["_id"]}, {"$pull": {"product_ids": pid}})
        return {"added": False}
    await db.collections.update_one({"_id": col["_id"]}, {"$addToSet": {"product_ids": pid}})
    return {"added": True}


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, user=Depends(current_user)):
    res = await db.collections.delete_one({"_id": oid(collection_id), "user_id": oid(user["id"])})
    if not res.deleted_count:
        raise HTTPException(404, "Collection not found")
    return {"ok": True}


@router.post("/admin/collections/{collection_id}/feature")
async def feature_collection(collection_id: str, user=Depends(require(*ADMIN_ROLES))):
    col = await db.collections.find_one({"_id": oid(collection_id)})
    if not col:
        raise HTTPException(404, "Collection not found")
    new_val = not col.get("featured", False)
    await db.collections.update_one({"_id": col["_id"]}, {"$set": {"featured": new_val}})
    return {"featured": new_val}
