from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.get("/verification/my")
async def my_verification(user=Depends(current_user)):
    queries = [{"subject_id": user["id"]}]
    if user.get("company_id"):
        queries.append({"subject_id": user["company_id"]})
    docs = await db.verifications.find({"$or": queries}).to_list(5)
    return [public_verification(d) for d in docs]


@router.post("/verification/submit")
async def submit_verification(request: Request, user=Depends(current_user)):
    body = await request.json()
    subject_type = body.get("subject_type", "user")
    subject_id = user["id"]
    subject_name = user["name"]
    if subject_type == "company":
        if not user.get("company_id"):
            raise HTTPException(400, "No company account")
        company, role = await company_role(user, user["company_id"])
        if role not in {"owner", "admin"}:
            raise HTTPException(403, "Only company owner/admin can submit verification")
        subject_id = user["company_id"]
        subject_name = company["name"]
    elif user["role"] != "retailer":
        raise HTTPException(400, "Only retailer accounts submit individual verification")
    existing = await db.verifications.find_one({"subject_id": subject_id})
    if existing and existing.get("status") == "approved":
        raise HTTPException(400, "Already verified")
    data = {k: v for k, v in body.items() if k in KYC_FIELDS}
    if not data.get("business_name"):
        raise HTTPException(400, "Business name is required")
    action = body.get("action", "submit")
    if action == "submit" and not any(data.get(k) for k in ("gstin", "msme", "pan", "govt_id")):
        raise HTTPException(400, "Provide at least one identity document (GSTIN, MSME, PAN or government ID)")
    status = "submitted" if action == "submit" else "draft"
    docs_in = [{"id": uuid.uuid4().hex[:8], "name": d.get("name", "document"), "url": d.get("url", ""),
                "status": "pending", "note": ""}
               for d in body.get("documents", []) if isinstance(d, dict) and d.get("url")]
    doc = {**data, "subject_id": subject_id, "subject_type": subject_type, "subject_name": subject_name,
           "status": status, "updated_at": datetime.now(timezone.utc)}
    if docs_in:
        doc["documents"] = docs_in
    if existing:
        if not docs_in and existing.get("documents"):
            doc["documents"] = existing["documents"]
        await db.verifications.update_one({"_id": existing["_id"]}, {"$set": doc})
        vid = existing["_id"]
    else:
        doc["created_at"] = datetime.now(timezone.utc)
        doc["notes"] = []
        doc["history"] = []
        doc.setdefault("documents", docs_in)
        res = await db.verifications.insert_one(doc)
        vid = res.inserted_id
    if action == "submit":
        for admin in await db.users.find({"role": {"$in": list(ADMIN_ROLES)}}).to_list(10):
            await notify(admin["_id"], "kyc", f"Verification submitted: {subject_name}", "/admin")
    return public_verification(await db.verifications.find_one({"_id": vid}))
