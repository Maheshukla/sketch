

from deps import (
    APIRouter,
    Depends,
    HTTPException,
    PortfolioIn,
    _razorpay,  # noqa: F401
    current_user,
    datetime,
    db,
    oid,
    pub,
    require,
    require_avatar,
    timezone,
)

router = APIRouter()


@router.post("/portfolio")
async def create_portfolio(data: PortfolioIn, user=Depends(require("artist", "company_owner", "company_admin", "company_artist", "retailer"))):
    require_avatar(user)
    if not [i for i in (data.images or []) if isinstance(i, str) and i.strip()]:
        raise HTTPException(400, "At least one image is required for a portfolio piece")
    doc = {**data.model_dump(), "user_id": oid(user["id"]), "created_at": datetime.now(timezone.utc)}
    res = await db.portfolio.insert_one(doc)
    return pub(await db.portfolio.find_one({"_id": res.inserted_id}))


@router.get("/portfolio/{user_id}")
async def get_portfolio(user_id: str):
    items = await db.portfolio.find({"user_id": oid(user_id)}).sort("created_at", -1).to_list(100)
    return [pub(i) for i in items]


@router.delete("/portfolio/{item_id}")
async def delete_portfolio(item_id: str, user=Depends(current_user)):
    res = await db.portfolio.delete_one({"_id": oid(item_id), "user_id": oid(user["id"])})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}
