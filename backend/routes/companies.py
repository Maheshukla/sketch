from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/companies")
async def create_company(data: CompanyIn, user=Depends(current_user)):
    if user.get("company_id"):
        raise HTTPException(400, "Already in a company")
    if user["role"] not in {"company_owner", "artist"}:
        raise HTTPException(403, "Only artists can register a company")
    doc = {
        "name": data.name, "description": data.description, "avatar": "",
        "owner_id": oid(user["id"]),
        "members": [{"user_id": oid(user["id"]), "role": "owner", "name": user["name"], "email": user["email"]}],
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.companies.insert_one(doc)
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"company_id": res.inserted_id, "role": "company_owner"}})
    company = await db.companies.find_one({"_id": res.inserted_id})
    return pub(company)


@router.get("/companies/my")
async def my_company(user=Depends(current_user)):
    if not user.get("company_id"):
        return None
    company = await db.companies.find_one({"_id": oid(user["company_id"])})
    return pub(company)


@router.get("/companies/{company_id}")
async def get_company(company_id: str):
    company = await db.companies.find_one({"_id": oid(company_id)})
    if not company:
        raise HTTPException(404, "Company not found")
    return pub(company)


@router.post("/companies/{company_id}/members")
async def add_member(company_id: str, request: Request, user=Depends(current_user)):
    company, role = await company_role(user, company_id)
    if role not in {"owner", "admin"}:
        raise HTTPException(403, "Only owner or admin can add members")
    body = await request.json()
    member = await db.users.find_one({"email": body.get("email", "").lower()})
    if not member:
        raise HTTPException(404, "User with that email not found")
    mrole = body.get("role", "artist")
    if mrole not in {"admin", "artist"}:
        raise HTTPException(400, "Role must be admin or artist")
    if any(str(m["user_id"]) == str(member["_id"]) for m in company["members"]):
        raise HTTPException(400, "Already a member")
    await db.companies.update_one({"_id": company["_id"]}, {"$push": {"members": {
        "user_id": member["_id"], "role": mrole, "name": member["name"], "email": member["email"]}}})
    new_role = "company_admin" if mrole == "admin" else "company_artist"
    await db.users.update_one({"_id": member["_id"]}, {"$set": {"company_id": company["_id"], "role": new_role}})
    await notify(member["_id"], "company", f"You were added to {company['name']} as {mrole}", "/company")
    return pub(await db.companies.find_one({"_id": company["_id"]}))


@router.delete("/companies/{company_id}/members/{member_id}")
async def remove_member(company_id: str, member_id: str, user=Depends(current_user)):
    company, role = await company_role(user, company_id)
    if role not in {"owner", "admin"}:
        raise HTTPException(403, "Only owner or admin can remove members")
    mid = oid(member_id)
    member = next((m for m in company["members"] if m["user_id"] == mid), None)
    if not member or member["role"] == "owner":
        raise HTTPException(400, "Cannot remove owner")
    await db.companies.update_one({"_id": company["_id"]}, {"$pull": {"members": {"user_id": mid}}})
    await db.users.update_one({"_id": mid}, {"$unset": {"company_id": ""}, "$set": {"role": "artist"}})
    return pub(await db.companies.find_one({"_id": company["_id"]}))
