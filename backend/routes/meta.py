

from deps import (
    ADMIN_ROLES,
    COURIERS,
    APIRouter,
    Depends,
    Request,
    _razorpay,  # noqa: F401
    db,
    pub,
    require,
)

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Sketch API"}


@router.get("/categories")
async def list_categories():
    cats = await db.categories.find().to_list(100)
    return [pub(c) for c in cats]


@router.get("/couriers")
async def list_couriers():
    return COURIERS


@router.get("/banners")
async def list_banners():
    banners = await db.banners.find({"active": True}).sort("order", 1).to_list(20)
    return [pub(b) for b in banners]


@router.post("/admin/banners")
async def create_banner(request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    doc = {"title": body["title"], "subtitle": body.get("subtitle", ""), "image": body.get("image", ""),
           "cta_label": body.get("cta_label", "Explore"), "cta_link": body.get("cta_link", "/marketplace"),
           "tag": body.get("tag", "Promotion"), "order": int(body.get("order", 99)), "active": True}
    res = await db.banners.insert_one(doc)
    return pub(await db.banners.find_one({"_id": res.inserted_id}))
