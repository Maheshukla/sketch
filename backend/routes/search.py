from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.get("/search")
async def search(q: str = ""):
    if not q:
        return {"products": [], "creators": [], "reels": []}
    rx = {"$regex": q, "$options": "i"}
    products = await db.products.find({"status": "approved", "$or": [{"title": rx}, {"description": rx}, {"tags": rx}]}).limit(20).to_list(20)
    creators = await db.users.find({"role": {"$in": ["artist", "retailer", "company_owner"]}, "$or": [{"name": rx}, {"specialty": rx}]}).limit(10).to_list(10)
    reels = await db.reels.find({"status": "approved", "caption": rx}).limit(20).to_list(20)
    return {"products": [pub(p) for p in products],
            "creators": [public_user(c) for c in creators],
            "reels": [pub(r) for r in reels]}
