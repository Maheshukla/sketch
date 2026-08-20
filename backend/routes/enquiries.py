

from deps import (
    ADMIN_ROLES,
    APIRouter,
    Depends,
    HTTPException,
    Request,
    _razorpay,  # noqa: F401
    datetime,
    db,
    notify,
    oid,
    pub,
    require,
    timedelta,
    timezone,
)

router = APIRouter()


@router.post("/enquiries")
async def create_enquiry(request: Request):
    body = await request.json()
    if not body.get("name") or not body.get("requirement"):
        raise HTTPException(400, "Name and requirement are required")
    ip = request.client.host if request.client else "unknown"
    recent = await db.enquiries.count_documents({
        "ip": ip, "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(hours=1)}})
    if recent >= 20:
        raise HTTPException(429, "Too many enquiries — please try again later")
    doc = {"name": body["name"], "company": body.get("company", ""), "requirement": body["requirement"],
           "budget": body.get("budget", ""), "description": body.get("description", ""),
           "ip": ip, "status": "open", "created_at": datetime.now(timezone.utc)}
    res = await db.enquiries.insert_one(doc)
    for admin in await db.users.find({"role": {"$in": list(ADMIN_ROLES)}}).to_list(10):
        await notify(admin["_id"], "enquiry", f"Platform enquiry from {body['name']}", "/admin")
    return pub(await db.enquiries.find_one({"_id": res.inserted_id}))


@router.get("/admin/enquiries")
async def list_enquiries(user=Depends(require(*ADMIN_ROLES))):
    items = await db.enquiries.find().sort("created_at", -1).to_list(200)
    return [pub(i) for i in items]


@router.post("/admin/enquiries/{enquiry_id}/resolve")
async def resolve_enquiry(enquiry_id: str, user=Depends(require(*ADMIN_ROLES))):
    res = await db.enquiries.update_one({"_id": oid(enquiry_id)},
                                        {"$set": {"status": "resolved", "resolved_by": user["name"],
                                                  "resolved_at": datetime.now(timezone.utc)}})
    if not res.matched_count:
        raise HTTPException(404, "Enquiry not found")
    return {"ok": True}
