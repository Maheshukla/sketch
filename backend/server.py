from dotenv import load_dotenv

load_dotenv()

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta

import jwt as pyjwt
import requests
from bson import ObjectId
from fastapi import Depends, FastAPI, APIRouter, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import Response as RawResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware

from auth import (
    ALL_ROLES, ADMIN_ROLES, CREATOR_ROLES, COURIERS, STAFF_ROLES,
    create_access_token, get_current_user, hash_password, new_otp,
    public_user, set_auth_cookies, verify_password,
)
from seed import seed
from storage import get_object, init_storage, put_object, upload_path

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Sketch API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PLATFORM_FEE_RATE = 0.10
TAX_RATE = 0.05
SHIPPING_FLAT = 99.0
PACKAGING_FLAT = 49.0
ADVANCE_RATE = 0.30


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def pub(doc: dict) -> dict:
    if not doc:
        return doc
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [pub(i) if isinstance(i, dict) else (str(i) if isinstance(i, ObjectId) else i) for i in v]
        else:
            out[k] = v
    return out


async def notify(user_id, ntype: str, message: str, link: str = ""):
    await db.notifications.insert_one({
        "user_id": ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id,
        "type": ntype, "message": message, "link": link, "read": False,
        "created_at": datetime.now(timezone.utc),
    })


def fee_breakdown(subtotal: float, has_physical: bool) -> dict:
    tax = round(subtotal * TAX_RATE, 2)
    shipping = SHIPPING_FLAT if has_physical else 0.0
    packaging = PACKAGING_FLAT if has_physical else 0.0
    platform_fee = round(subtotal * PLATFORM_FEE_RATE, 2)
    total = round(subtotal + tax + shipping + packaging, 2)
    return {"subtotal": subtotal, "tax": tax, "shipping": shipping,
            "packaging": packaging, "platform_fee": platform_fee, "total": total}


async def current_user(request: Request):
    return await get_current_user(request, db)


def require(*roles):
    async def dep(user=Depends(current_user)):
        if roles and user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


# ---------------- Auth ----------------

class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "customer"
    mobile: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@api_router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if data.role not in {"customer", "artist", "retailer", "company"}:
        raise HTTPException(400, "Invalid role")
    role = "company_owner" if data.role == "company" else data.role
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {
        "email": email, "password_hash": hash_password(data.password), "name": data.name,
        "role": role, "status": "active", "followers": [], "following": [],
        "bio": "", "avatar": "", "banner": "", "specialty": "", "mobile": data.mobile,
        "courier_preference": "Delhivery", "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": res.inserted_id})
    set_auth_cookies(response, str(res.inserted_id), email, role)
    return public_user(user)


@api_router.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked = attempt.get("locked_until")
        if locked and locked > datetime.now(timezone.utc):
            raise HTTPException(429, "Too many failed attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended")
    set_auth_cookies(response, str(user["_id"]), email, user["role"])
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    unread = await db.notifications.count_documents({"user_id": oid(user["id"]), "read": False})
    return {**user, "unread_notifications": unread}


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    response.set_cookie("access_token", create_access_token(str(user["_id"]), user["email"], user["role"]),
                        httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    return {"ok": True}


class OtpRequestIn(BaseModel):
    identifier: str


class OtpVerifyIn(BaseModel):
    identifier: str
    otp: str
    name: str = ""
    role: str = "customer"


@api_router.post("/auth/otp/request")
async def otp_request(data: OtpRequestIn):
    identifier = data.identifier.strip().lower()
    if not identifier:
        raise HTTPException(400, "Email or mobile required")
    code = new_otp()
    await db.otps.delete_many({"identifier": identifier})
    await db.otps.insert_one({
        "identifier": identifier, "otp": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "created_at": datetime.now(timezone.utc),
    })
    # MOCKED SMS/EMAIL delivery: in production, send via SMS provider. Returned here for dev.
    logger.info(f"OTP for {identifier}: {code}")
    return {"sent": True, "dev_otp": code}


@api_router.post("/auth/otp/verify")
async def otp_verify(data: OtpVerifyIn, response: Response):
    identifier = data.identifier.strip().lower()
    rec = await db.otps.find_one({"identifier": identifier, "otp": data.otp})
    if not rec:
        raise HTTPException(400, "Invalid or expired OTP")
    await db.otps.delete_many({"identifier": identifier})
    query = {"email": identifier} if "@" in identifier else {"mobile": identifier}
    user = await db.users.find_one(query)
    if not user:
        role = data.role if data.role in {"customer", "artist", "retailer"} else "customer"
        doc = {
            "email": identifier if "@" in identifier else "",
            "mobile": "" if "@" in identifier else identifier,
            "password_hash": "", "name": data.name or "Sketch User", "role": role,
            "status": "active", "followers": [], "following": [], "bio": "", "avatar": "",
            "banner": "", "specialty": "", "courier_preference": "Delhivery",
            "created_at": datetime.now(timezone.utc),
        }
        res = await db.users.insert_one(doc)
        user = await db.users.find_one({"_id": res.inserted_id})
    set_auth_cookies(response, str(user["_id"]), user.get("email", ""), user["role"])
    return public_user(user)


@api_router.post("/auth/google/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id", "")
    if not session_id:
        raise HTTPException(400, "session_id required")
    r = requests.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(401, "Invalid Google session")
    gdata = r.json()
    email = gdata["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        doc = {
            "email": email, "password_hash": "", "name": gdata.get("name", "Sketch User"),
            "role": "customer", "status": "active", "followers": [], "following": [],
            "bio": "", "avatar": gdata.get("picture", ""), "banner": "", "specialty": "",
            "mobile": "", "courier_preference": "Delhivery",
            "created_at": datetime.now(timezone.utc),
        }
        res = await db.users.insert_one(doc)
        user = await db.users.find_one({"_id": res.inserted_id})
    set_auth_cookies(response, str(user["_id"]), email, user["role"])
    return public_user(user)


# ---------------- Uploads ----------------

@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(current_user)):
    path, content_type = upload_path(user["id"], file.filename or "file.bin")
    data = await file.read()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 200MB)")
    allowed_mime = {"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"}
    if (file.content_type or content_type) not in allowed_mime:
        raise HTTPException(400, "Only JPG, PNG, WEBP, GIF and MP4 files are allowed")
    result = put_object(path, data, file.content_type or content_type)
    await db.files.insert_one({
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": file.content_type or content_type, "size": result["size"],
        "uploader_id": oid(user["id"]), "is_deleted": False,
        "created_at": datetime.now(timezone.utc),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(404, "File not found")
    data, content_type = get_object(path)
    return RawResponse(content=data, media_type=record.get("content_type", content_type))


# ---------------- Meta ----------------

@api_router.get("/")
async def root():
    return {"message": "Sketch API"}


@api_router.get("/categories")
async def list_categories():
    cats = await db.categories.find().to_list(100)
    return [pub(c) for c in cats]


@api_router.get("/couriers")
async def list_couriers():
    return COURIERS


# ---------------- Users / Profiles ----------------

@api_router.put("/users/me")
async def update_profile(request: Request, user=Depends(current_user)):
    body = await request.json()
    allowed = {"name", "bio", "avatar", "banner", "specialty", "mobile", "courier_preference"}
    update = {k: v for k, v in body.items() if k in allowed}
    if update.get("courier_preference") and update["courier_preference"] not in COURIERS:
        raise HTTPException(400, "Invalid courier")
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": update})
    return public_user(await db.users.find_one({"_id": oid(user["id"])}))


@api_router.get("/users/{user_id}")
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


@api_router.post("/users/{user_id}/follow")
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


@api_router.post("/users/me/become-retailer")
async def become_retailer(user=Depends(current_user)):
    if user["role"] != "customer":
        raise HTTPException(400, "Only customer accounts can convert to retailer")
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"role": "retailer"}})
    return {"ok": True, "role": "retailer"}


ALLOWED_SETTINGS = {"private_profile", "show_activity", "notify_orders", "notify_social",
                    "notify_marketing", "default_payment", "default_address",
                    "notifications", "theme", "courier_preference", "privacy"}


@api_router.put("/users/me/settings")
async def update_settings(request: Request, user=Depends(current_user)):
    body = await request.json()
    clean = {k: v for k, v in body.items() if k in ALLOWED_SETTINGS}
    await db.users.update_one({"_id": oid(user["id"])}, {"$set": {"settings": clean}})
    return {"ok": True}


@api_router.get("/users/{user_id}/reviews")
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


@api_router.get("/creators")
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


# ---------------- Companies ----------------

class CompanyIn(BaseModel):
    name: str
    description: str = ""


@api_router.post("/companies")
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


@api_router.get("/companies/my")
async def my_company(user=Depends(current_user)):
    if not user.get("company_id"):
        return None
    company = await db.companies.find_one({"_id": oid(user["company_id"])})
    return pub(company)


@api_router.get("/companies/{company_id}")
async def get_company(company_id: str):
    company = await db.companies.find_one({"_id": oid(company_id)})
    if not company:
        raise HTTPException(404, "Company not found")
    return pub(company)


async def company_role(user, company_id):
    company = await db.companies.find_one({"_id": oid(company_id)})
    if not company:
        raise HTTPException(404, "Company not found")
    for m in company["members"]:
        if str(m["user_id"]) == user["id"]:
            return company, m["role"]
    raise HTTPException(403, "Not a company member")


@api_router.post("/companies/{company_id}/members")
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


@api_router.delete("/companies/{company_id}/members/{member_id}")
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


# ---------------- Portfolio ----------------

class PortfolioIn(BaseModel):
    title: str
    description: str = ""
    images: list[str] = []
    category: str = ""


@api_router.post("/portfolio")
async def create_portfolio(data: PortfolioIn, user=Depends(require("artist", "company_owner", "company_admin", "company_artist", "retailer"))):
    doc = {**data.model_dump(), "user_id": oid(user["id"]), "created_at": datetime.now(timezone.utc)}
    res = await db.portfolio.insert_one(doc)
    return pub(await db.portfolio.find_one({"_id": res.inserted_id}))


@api_router.get("/portfolio/{user_id}")
async def get_portfolio(user_id: str):
    items = await db.portfolio.find({"user_id": oid(user_id)}).sort("created_at", -1).to_list(100)
    return [pub(i) for i in items]


@api_router.delete("/portfolio/{item_id}")
async def delete_portfolio(item_id: str, user=Depends(current_user)):
    res = await db.portfolio.delete_one({"_id": oid(item_id), "user_id": oid(user["id"])})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------- Reels ----------------

class ReelIn(BaseModel):
    caption: str
    media_url: str
    media_type: str = "image"
    product_id: str = ""


@api_router.post("/reels")
async def create_reel(data: ReelIn, user=Depends(require("artist", "company_owner", "company_admin", "company_artist", "retailer"))):
    if data.media_type not in {"image", "video"}:
        raise HTTPException(400, "media_type must be image or video")
    doc = {
        "caption": data.caption, "media_url": data.media_url, "media_type": data.media_type,
        "creator_id": oid(user["id"]), "creator_name": user["name"], "creator_avatar": user.get("avatar", ""),
        "likes": [], "saves": [], "shares": 0, "comments": [],
        "status": "pending", "created_at": datetime.now(timezone.utc),
    }
    if data.product_id:
        doc["product_id"] = oid(data.product_id)
    res = await db.reels.insert_one(doc)
    return pub(await db.reels.find_one({"_id": res.inserted_id}))


@api_router.get("/reels")
async def feed(request: Request, saved: bool = False, creator_id: str = ""):
    query = {"status": "approved"}
    if creator_id:
        query["creator_id"] = oid(creator_id)
    me = None
    try:
        me = await get_current_user(request, db)
    except HTTPException:
        pass
    if saved and me:
        query["saves"] = oid(me["id"])
    reels = await db.reels.find(query).sort("created_at", -1).to_list(100)
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


@api_router.post("/reels/{reel_id}/like")
async def like_reel(reel_id: str, user=Depends(current_user)):
    rid, uid = oid(reel_id), oid(user["id"])
    reel = await db.reels.find_one({"_id": rid})
    if not reel:
        raise HTTPException(404, "Reel not found")
    if uid in reel.get("likes", []):
        await db.reels.update_one({"_id": rid}, {"$pull": {"likes": uid}})
        return {"liked": False}
    await db.reels.update_one({"_id": rid}, {"$addToSet": {"likes": uid}})
    return {"liked": True}


@api_router.post("/reels/{reel_id}/save")
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


@api_router.post("/reels/{reel_id}/share")
async def share_reel(reel_id: str):
    await db.reels.update_one({"_id": oid(reel_id)}, {"$inc": {"shares": 1}})
    return {"ok": True}


@api_router.post("/reels/{reel_id}/comments")
async def comment_reel(reel_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Comment text required")
    comment = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"],
               "text": text, "status": "approved", "created_at": datetime.now(timezone.utc).isoformat()}
    comment_for_db = {**comment, "user_id": oid(user["id"])}
    await db.reels.update_one({"_id": oid(reel_id)}, {"$push": {"comments": comment_for_db}})
    return comment


@api_router.get("/reels/{reel_id}/comments")
async def reel_comments(reel_id: str):
    reel = await db.reels.find_one({"_id": oid(reel_id)})
    if not reel:
        raise HTTPException(404, "Reel not found")
    return [c for c in pub(reel).get("comments", []) if c.get("status") == "approved"]


# ---------------- Products ----------------

class ProductIn(BaseModel):
    title: str
    description: str = ""
    category: str
    subcategory: str = ""
    price: float
    stock: int = 1
    images: list[str] = []
    product_type: str = "physical"
    tags: list[str] = []


@api_router.post("/products")
async def create_product(data: ProductIn, user=Depends(require("artist", "retailer", "company_owner", "company_admin", "company_artist"))):
    if data.product_type not in {"physical", "digital", "software"}:
        raise HTTPException(400, "Invalid product type")
    seller_id = oid(user["id"])
    seller_type = "user"
    seller_name = user["name"]
    if user["role"].startswith("company_") and user.get("company_id"):
        company = await db.companies.find_one({"_id": oid(user["company_id"])})
        if company:
            seller_id = company["_id"]
            seller_type = "company"
            seller_name = company["name"]
    doc = {**data.model_dump(), "seller_id": seller_id, "seller_type": seller_type,
           "seller_name": seller_name, "status": "pending", "rating": 0, "reviews": [],
           "sales": 0, "created_at": datetime.now(timezone.utc)}
    res = await db.products.insert_one(doc)
    return pub(await db.products.find_one({"_id": res.inserted_id}))


@api_router.get("/products")
async def list_products(q: str = "", category: str = "", product_type: str = "",
                        min_price: float = 0, max_price: float = 0, seller_id: str = "",
                        status: str = "approved", limit: int = 60):
    query = {"status": status}
    if q:
        query["$or"] = [{"title": {"$regex": q, "$options": "i"}},
                        {"description": {"$regex": q, "$options": "i"}},
                        {"tags": {"$regex": q, "$options": "i"}}]
    if category:
        query["category"] = category
    if product_type:
        query["product_type"] = product_type
    if min_price:
        query.setdefault("price", {})["$gte"] = min_price
    if max_price:
        query.setdefault("price", {})["$lte"] = max_price
    if seller_id:
        query["seller_id"] = oid(seller_id)
    items = await db.products.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [pub(i) for i in items]


@api_router.get("/products/recommended")
async def recommended_products():
    items = await db.products.find({"status": "approved"}).sort("sales", -1).limit(8).to_list(8)
    return [pub(i) for i in items]


@api_router.get("/products/{product_id}/related")
async def related_products(product_id: str):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    items = await db.products.find(
        {"status": "approved", "category": prod["category"], "_id": {"$ne": prod["_id"]}}
    ).limit(8).to_list(8)
    return [pub(i) for i in items]


@api_router.post("/products/{product_id}/view")
async def track_product_view(product_id: str, request: Request):
    pid = oid(product_id)
    await db.products.update_one({"_id": pid}, {"$inc": {"views": 1}})
    try:
        me = await get_current_user(request, db)
    except HTTPException:
        return {"ok": True}
    uid = oid(me["id"])
    await db.recently_viewed.update_one({"user_id": uid}, {"$pull": {"items": {"product_id": pid}}}, upsert=True)
    await db.recently_viewed.update_one(
        {"user_id": uid},
        {"$push": {"items": {"$each": [{"product_id": pid, "at": datetime.now(timezone.utc)}], "$slice": -20}}},
        upsert=True)
    return {"ok": True}


@api_router.get("/recently-viewed")
async def get_recently_viewed(user=Depends(current_user)):
    rv = await db.recently_viewed.find_one({"user_id": oid(user["id"])})
    items = []
    for entry in reversed((rv or {}).get("items", [])):
        prod = await db.products.find_one({"_id": entry["product_id"]})
        if prod:
            items.append(pub(prod))
    return {"items": items}


@api_router.get("/products/{product_id}")
async def get_product(product_id: str):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    return pub(prod)


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, request: Request, user=Depends(current_user)):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    if str(prod["seller_id"]) not in {user["id"], user.get("company_id", "")} and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your product")
    body = await request.json()
    allowed = {"title", "description", "price", "stock", "images", "category", "subcategory", "tags", "product_type"}
    await db.products.update_one({"_id": prod["_id"]}, {"$set": {k: v for k, v in body.items() if k in allowed}})
    return pub(await db.products.find_one({"_id": prod["_id"]}))


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(current_user)):
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    if str(prod["seller_id"]) not in {user["id"], user.get("company_id", "")} and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your product")
    await db.products.delete_one({"_id": prod["_id"]})
    return {"ok": True}


@api_router.post("/products/{product_id}/reviews")
async def review_product(product_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    rating = int(body.get("rating", 5))
    if not 1 <= rating <= 5:
        raise HTTPException(400, "Rating must be 1-5")
    review = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"],
              "rating": rating, "text": body.get("text", ""),
              "created_at": datetime.now(timezone.utc).isoformat()}
    prod = await db.products.find_one({"_id": oid(product_id)})
    if not prod:
        raise HTTPException(404, "Product not found")
    reviews = prod.get("reviews", []) + [{**review, "user_id": oid(user["id"])}]
    avg = round(sum(r["rating"] for r in reviews) / len(reviews), 1)
    await db.products.update_one({"_id": prod["_id"]}, {"$set": {"reviews": reviews, "rating": avg}})
    return review


# ---------------- Cart / Wishlist ----------------

@api_router.get("/cart")
async def get_cart(user=Depends(current_user)):
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    items = []
    if cart:
        for it in cart.get("items", []):
            prod = await db.products.find_one({"_id": it["product_id"]})
            if prod:
                items.append({**pub(prod), "qty": it["qty"], "saved": it.get("saved", False)})
    return {"items": items}


@api_router.post("/cart")
async def add_to_cart(request: Request, user=Depends(current_user)):
    body = await request.json()
    pid = oid(body["product_id"])
    qty = max(1, int(body.get("qty", 1)))
    if not await db.products.find_one({"_id": pid}):
        raise HTTPException(404, "Product not found")
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    if cart and any(i["product_id"] == pid for i in cart.get("items", [])):
        await db.carts.update_one({"user_id": oid(user["id"]), "items.product_id": pid},
                                  {"$inc": {"items.$.qty": qty}})
    else:
        await db.carts.update_one({"user_id": oid(user["id"])},
                                  {"$push": {"items": {"product_id": pid, "qty": qty}}}, upsert=True)
    return {"ok": True}


@api_router.put("/cart/{product_id}")
async def update_cart_item(product_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    qty = int(body.get("qty", 1))
    if qty <= 0:
        await db.carts.update_one({"user_id": oid(user["id"])},
                                  {"$pull": {"items": {"product_id": oid(product_id)}}})
    else:
        await db.carts.update_one({"user_id": oid(user["id"]), "items.product_id": oid(product_id)},
                                  {"$set": {"items.$.qty": qty}})
    return {"ok": True}


@api_router.delete("/cart/{product_id}")
async def remove_cart_item(product_id: str, user=Depends(current_user)):
    await db.carts.update_one({"user_id": oid(user["id"])},
                              {"$pull": {"items": {"product_id": oid(product_id)}}})
    return {"ok": True}


@api_router.put("/cart/{product_id}/save-for-later")
async def toggle_save_for_later(product_id: str, user=Depends(current_user)):
    pid = oid(product_id)
    cart = await db.carts.find_one({"user_id": oid(user["id"]), "items.product_id": pid})
    if not cart:
        raise HTTPException(404, "Item not in cart")
    item = next(i for i in cart["items"] if i["product_id"] == pid)
    await db.carts.update_one({"user_id": oid(user["id"]), "items.product_id": pid},
                              {"$set": {"items.$.saved": not item.get("saved", False)}})
    return {"saved": not item.get("saved", False)}


@api_router.get("/wishlist")
async def get_wishlist(user=Depends(current_user)):
    wl = await db.wishlists.find_one({"user_id": oid(user["id"])})
    items = []
    if wl:
        for pid in wl.get("product_ids", []):
            prod = await db.products.find_one({"_id": pid})
            if prod:
                items.append(pub(prod))
    return {"items": items}


@api_router.post("/wishlist/{product_id}")
async def toggle_wishlist(product_id: str, user=Depends(current_user)):
    pid = oid(product_id)
    wl = await db.wishlists.find_one({"user_id": oid(user["id"])})
    if wl and pid in wl.get("product_ids", []):
        await db.wishlists.update_one({"user_id": oid(user["id"])}, {"$pull": {"product_ids": pid}})
        return {"wishlisted": False}
    await db.wishlists.update_one({"user_id": oid(user["id"])},
                                  {"$addToSet": {"product_ids": pid}}, upsert=True)
    return {"wishlisted": True}


# ---------------- Payments (mock gateway, Razorpay-shaped) ----------------

@api_router.post("/payments/create")
async def create_payment(request: Request, user=Depends(current_user)):
    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "Invalid amount")
    order = {
        "order_id": f"order_mock_{uuid.uuid4().hex[:16]}", "amount": amount,
        "currency": "INR", "purpose": body.get("purpose", "order"),
        "ref_id": body.get("ref_id", ""), "user_id": oid(user["id"]),
        "status": "created", "created_at": datetime.now(timezone.utc),
    }
    await db.payment_orders.insert_one(order)
    return pub(order)


@api_router.post("/payments/verify")
async def verify_payment(request: Request, user=Depends(current_user)):
    # MOCKED gateway: always succeeds. Swap with Razorpay signature verification when keys are configured.
    body = await request.json()
    order = await db.payment_orders.find_one({"order_id": body.get("order_id", "")})
    if not order or order["status"] != "created":
        raise HTTPException(400, "Invalid payment order")
    payment_id = f"pay_mock_{uuid.uuid4().hex[:14]}"
    await db.payment_orders.update_one({"_id": order["_id"]}, {"$set": {"status": "paid"}})
    pres = await db.payments.insert_one({
        "payment_id": payment_id, "order_id": order["order_id"], "user_id": oid(user["id"]),
        "amount": order["amount"], "purpose": order["purpose"], "ref_id": order.get("ref_id", ""),
        "method": body.get("method", "upi"), "escrow": "held",
        "created_at": datetime.now(timezone.utc),
    })
    return {"payment_id": payment_id, "id": str(pres.inserted_id), "status": "held", "ref_id": order.get("ref_id", ""), "purpose": order["purpose"]}


async def release_escrow(ref_id: str, purpose: str):
    payment = await db.payments.find_one({"ref_id": ref_id, "purpose": purpose, "escrow": "held"})
    if payment:
        await db.payments.update_one({"_id": payment["_id"]}, {"$set": {"escrow": "released", "released_at": datetime.now(timezone.utc)}})


# ---------------- Orders ----------------

@api_router.post("/orders/checkout")
async def checkout(request: Request, user=Depends(current_user)):
    body = await request.json()
    method = body.get("payment_method", "upi")
    if method not in {"upi", "card", "netbanking", "wallet"}:
        raise HTTPException(400, "Invalid payment method")
    cart = await db.carts.find_one({"user_id": oid(user["id"])})
    if not cart or not cart.get("items"):
        raise HTTPException(400, "Cart is empty")
    items = []
    subtotal = 0.0
    has_physical = False
    for it in cart["items"]:
        if it.get("saved"):
            continue
        prod = await db.products.find_one({"_id": it["product_id"]})
        if not prod or prod["status"] != "approved":
            continue
        if prod["product_type"] == "physical" and prod["stock"] < it["qty"]:
            raise HTTPException(400, f"Insufficient stock for {prod['title']}")
        subtotal += prod["price"] * it["qty"]
        has_physical = has_physical or prod["product_type"] == "physical"
        items.append({"product_id": prod["_id"], "title": prod["title"], "price": prod["price"],
                      "qty": it["qty"], "seller_id": prod["seller_id"], "seller_name": prod["seller_name"],
                      "product_type": prod["product_type"],
                      "image": prod["images"][0] if prod.get("images") else ""})
    if not items:
        raise HTTPException(400, "Cart is empty")
    fees = fee_breakdown(subtotal, has_physical)
    order = {
        "buyer_id": oid(user["id"]), "buyer_name": user["name"], "items": items,
        **fees, "payment_method": method, "status": "payment_pending",
        "address": body.get("address", ""), "courier": "", "tracking_id": "",
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.orders.insert_one(order)
    return {"order": pub(await db.orders.find_one({"_id": res.inserted_id}))}


@api_router.post("/orders/{order_id}/pay")
async def pay_order(order_id: str, request: Request, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id), "buyer_id": oid(user["id"])})
    if not order or order["status"] != "payment_pending":
        raise HTTPException(400, "Order not payable")
    body = await request.json()
    payment_db_id = body.get("payment_db_id", "")
    payment = await db.payments.find_one({"_id": oid(payment_db_id), "ref_id": order_id, "escrow": "held"})
    if not payment:
        raise HTTPException(400, "Payment not found")
    for it in order["items"]:
        await db.products.update_one({"_id": it["product_id"]},
                                     {"$inc": {"stock": -it["qty"] if it["product_type"] == "physical" else 0,
                                               "sales": it["qty"]}})
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "placed", "paid_at": datetime.now(timezone.utc)}})
    await db.carts.update_one({"user_id": oid(user["id"])}, {"$pull": {"items": {"saved": {"$ne": True}}}})
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "order", f"New order received from {user['name']}", "/orders")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@api_router.get("/orders")
async def my_orders(user=Depends(current_user)):
    orders = await db.orders.find({"buyer_id": oid(user["id"])}).sort("created_at", -1).to_list(100)
    return [pub(o) for o in orders]


@api_router.get("/orders/seller")
async def seller_orders(user=Depends(current_user)):
    seller_ids = [oid(user["id"])]
    if user.get("company_id"):
        seller_ids.append(oid(user["company_id"]))
    orders = await db.orders.find({"items.seller_id": {"$in": seller_ids}}).sort("created_at", -1).to_list(200)
    out = []
    for o in orders:
        o["items"] = [i for i in o["items"] if i["seller_id"] in seller_ids]
        out.append(pub(o))
    return out


@api_router.post("/orders/{order_id}/ship")
async def ship_order(order_id: str, request: Request, user=Depends(current_user)):
    body = await request.json()
    courier = body.get("courier", "")
    if courier not in COURIERS:
        raise HTTPException(400, "Select a valid courier partner")
    order = await db.orders.find_one({"_id": oid(order_id)})
    if not order or order["status"] != "placed":
        raise HTTPException(400, "Order cannot be shipped")
    seller_ids = {user["id"], user.get("company_id", "")}
    if not any(str(i["seller_id"]) in seller_ids for i in order["items"]) and user["role"] not in ADMIN_ROLES:
        raise HTTPException(403, "Not your order")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {
        "status": "shipped", "courier": courier, "tracking_id": body.get("tracking_id", ""),
        "shipped_at": datetime.now(timezone.utc)}})
    await notify(order["buyer_id"], "order", f"Your order shipped via {courier}", "/orders")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


@api_router.post("/orders/{order_id}/deliver")
async def deliver_order(order_id: str, user=Depends(current_user)):
    order = await db.orders.find_one({"_id": oid(order_id), "buyer_id": oid(user["id"])})
    if not order or order["status"] != "shipped":
        raise HTTPException(400, "Order cannot be marked delivered")
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc)}})
    await release_escrow(order_id, "order")
    for sid in {str(i["seller_id"]) for i in order["items"]}:
        await notify(sid, "payment", "Escrow released — payment credited", "/dashboard")
    return pub(await db.orders.find_one({"_id": order["_id"]}))


# ---------------- Custom Requests ----------------

CR_FLOW = ["submitted", "under_review", "sent_to_creator", "estimated",
           "approved", "paid", "in_progress", "delivered", "completed"]


class CustomRequestIn(BaseModel):
    target_id: str
    target_type: str = "user"
    title: str
    description: str = ""
    reference_images: list[str] = []
    budget: float = 0
    deadline: str = ""


@api_router.post("/custom-requests")
async def create_custom_request(data: CustomRequestIn, user=Depends(current_user)):
    doc = {**data.model_dump(), "customer_id": oid(user["id"]), "customer_name": user["name"],
           "status": "submitted", "estimate": None, "assigned_to": None,
           "delivery_images": [], "payment_type": "", "history": [
               {"status": "submitted", "at": datetime.now(timezone.utc).isoformat(), "by": user["name"]}],
           "created_at": datetime.now(timezone.utc)}
    res = await db.custom_requests.insert_one(doc)
    for admin in await db.users.find({"role": {"$in": list(ADMIN_ROLES)}}).to_list(10):
        await notify(admin["_id"], "custom_request", f"New custom request: {data.title}", "/admin")
    return pub(await db.custom_requests.find_one({"_id": res.inserted_id}))


@api_router.get("/custom-requests")
async def list_custom_requests(user=Depends(current_user)):
    uid = oid(user["id"])
    if user["role"] in STAFF_ROLES:
        query = {}
    elif user["role"] in {"company_owner", "company_admin"} and user.get("company_id"):
        query = {"$or": [{"customer_id": uid},
                         {"target_id": user["company_id"], "target_type": "company"}]}
    elif user["role"] == "company_artist" and user.get("company_id"):
        query = {"$or": [{"customer_id": uid}, {"assigned_to": str(uid)}]}
    else:
        query = {"$or": [{"customer_id": uid}, {"target_id": user["id"], "target_type": "user"}]}
    reqs = await db.custom_requests.find(query).sort("created_at", -1).to_list(200)
    out = []
    for r in reqs:
        item = pub(r)
        if r["target_type"] == "company":
            comp = await db.companies.find_one({"_id": oid(r["target_id"])})
            item["target_name"] = comp["name"] if comp else "Company"
        else:
            t = await db.users.find_one({"_id": oid(r["target_id"])})
            item["target_name"] = t["name"] if t else "Artist"
        out.append(item)
    return out


async def cr_transition(cr, status, by):
    history = cr.get("history", []) + [{"status": status, "at": datetime.now(timezone.utc).isoformat(), "by": by}]
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"status": status, "history": history}})


@api_router.post("/custom-requests/{cr_id}/review")
async def review_custom_request(cr_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] not in {"submitted", "under_review"}:
        raise HTTPException(400, "Request not reviewable")
    body = await request.json()
    if body.get("approve", True):
        await cr_transition(cr, "sent_to_creator", user["name"])
        target = cr["target_id"]
        if cr["target_type"] == "company":
            company = await db.companies.find_one({"_id": oid(target)})
            for m in (company["members"] if company else []):
                if m["role"] in {"owner", "admin"}:
                    await notify(m["user_id"], "custom_request", f"New custom request: {cr['title']}", "/custom-orders")
        else:
            await notify(oid(target), "custom_request", f"New custom request: {cr['title']}", "/custom-orders")
        await notify(cr["customer_id"], "custom_request", f"Your request '{cr['title']}' was sent to the creator", "/custom-orders")
    else:
        await cr_transition(cr, "rejected", user["name"])
        await notify(cr["customer_id"], "custom_request", f"Your request '{cr['title']}' was declined in review", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


async def cr_creator_check(user, cr):
    if cr["target_type"] == "company":
        if user["role"] not in {"company_owner", "company_admin"}:
            raise HTTPException(403, "Only company owner/admin can handle requests")
        company, _ = await company_role(user, cr["target_id"])
    elif str(cr.get("target_id")) != user["id"]:
        raise HTTPException(403, "Not your request")


@api_router.post("/custom-requests/{cr_id}/estimate")
async def estimate_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "sent_to_creator":
        raise HTTPException(400, "Request not awaiting estimate")
    await cr_creator_check(user, cr)
    body = await request.json()
    estimate = {"cost": float(body["cost"]), "deadline": body.get("deadline", ""),
                "message": body.get("message", ""), "by": user["name"],
                "at": datetime.now(timezone.utc).isoformat()}
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"estimate": estimate}})
    cr["estimate"] = estimate
    await cr_transition(cr, "estimated", user["name"])
    await notify(cr["customer_id"], "custom_request", f"Estimate ready for '{cr['title']}': ₹{estimate['cost']:,.0f}", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/respond")
async def respond_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "estimated":
        raise HTTPException(400, "Request not awaiting your approval")
    body = await request.json()
    if not body.get("accept", False):
        await cr_transition(cr, "declined", user["name"])
        return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))
    payment_type = body.get("payment_type", "full")
    if payment_type not in {"advance", "full"}:
        raise HTTPException(400, "payment_type must be advance or full")
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"payment_type": payment_type}})
    cr["payment_type"] = payment_type
    await cr_transition(cr, "approved", user["name"])
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/pay")
async def pay_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "approved":
        raise HTTPException(400, "Request not payable")
    body = await request.json()
    payment = await db.payments.find_one({"_id": oid(body.get("payment_db_id", "")), "ref_id": cr_id, "escrow": "held"})
    if not payment:
        raise HTTPException(400, "Payment not found")
    await cr_transition(cr, "paid", user["name"])
    target = cr["target_id"]
    if cr["target_type"] == "company":
        company = await db.companies.find_one({"_id": oid(target)})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "custom_request", f"Payment received for '{cr['title']}' — assign an artist", "/custom-orders")
    else:
        await notify(oid(target), "custom_request", f"Payment received for '{cr['title']}' — work can begin", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/assign")
async def assign_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["target_type"] != "company" or cr["status"] not in {"paid", "in_progress"}:
        raise HTTPException(400, "Request not assignable")
    await cr_creator_check(user, cr)
    body = await request.json()
    company, _ = await company_role(user, cr["target_id"])
    artist = next((m for m in company["members"] if str(m["user_id"]) == body.get("artist_id")), None)
    if not artist:
        raise HTTPException(404, "Artist not in company")
    await db.custom_requests.update_one({"_id": cr["_id"]},
                                        {"$set": {"assigned_to": str(artist["user_id"]), "assigned_name": artist["name"]}})
    await notify(artist["user_id"], "custom_request", f"You were assigned to '{cr['title']}'", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/start")
async def start_custom_request(cr_id: str, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "paid":
        raise HTTPException(400, "Request not ready to start")
    if cr["target_type"] == "company":
        allowed = str(cr.get("assigned_to") or "") == user["id"] or user["role"] in {"company_owner", "company_admin"}
        if not allowed:
            raise HTTPException(403, "Not assigned to you")
        await company_role(user, cr["target_id"])
    elif str(cr["target_id"]) != user["id"]:
        raise HTTPException(403, "Not your request")
    await cr_transition(cr, "in_progress", user["name"])
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/deliver")
async def deliver_custom_request(cr_id: str, request: Request, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or cr["status"] != "in_progress":
        raise HTTPException(400, "Request not in progress")
    if cr["target_type"] == "company":
        allowed = str(cr.get("assigned_to") or "") == user["id"] or user["role"] in {"company_owner", "company_admin"}
        if not allowed:
            raise HTTPException(403, "Not assigned to you")
        await company_role(user, cr["target_id"])
    elif str(cr["target_id"]) != user["id"]:
        raise HTTPException(403, "Not your request")
    body = await request.json()
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {
        "delivery_images": body.get("delivery_images", []), "delivery_note": body.get("note", "")}})
    await cr_transition(cr, "delivered", user["name"])
    await notify(cr["customer_id"], "custom_request", f"'{cr['title']}' was delivered for review", "/custom-orders")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


@api_router.post("/custom-requests/{cr_id}/complete")
async def complete_custom_request(cr_id: str, user=Depends(current_user)):
    cr = await db.custom_requests.find_one({"_id": oid(cr_id)})
    if not cr or str(cr["customer_id"]) != user["id"] or cr["status"] != "delivered":
        raise HTTPException(400, "Request not awaiting your review")
    await cr_transition(cr, "completed", user["name"])
    await release_escrow(cr_id, "custom")
    return pub(await db.custom_requests.find_one({"_id": cr["_id"]}))


# ---------------- Support ----------------

@api_router.post("/tickets")
async def create_ticket(request: Request, user=Depends(current_user)):
    body = await request.json()
    doc = {"user_id": oid(user["id"]), "user_name": user["name"], "subject": body["subject"],
           "category": body.get("category", "general"), "status": "open",
           "messages": [{"from": user["name"], "text": body["message"],
                         "at": datetime.now(timezone.utc).isoformat(), "staff": False}],
           "created_at": datetime.now(timezone.utc)}
    res = await db.tickets.insert_one(doc)
    return pub(await db.tickets.find_one({"_id": res.inserted_id}))


@api_router.get("/tickets")
async def list_tickets(user=Depends(current_user)):
    query = {} if user["role"] in STAFF_ROLES else {"user_id": oid(user["id"])}
    tickets = await db.tickets.find(query).sort("created_at", -1).to_list(200)
    return [pub(t) for t in tickets]


@api_router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, request: Request, user=Depends(current_user)):
    ticket = await db.tickets.find_one({"_id": oid(ticket_id)})
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    is_staff = user["role"] in STAFF_ROLES
    if not is_staff and str(ticket["user_id"]) != user["id"]:
        raise HTTPException(403, "Not your ticket")
    body = await request.json()
    msg = {"from": user["name"], "text": body["text"],
           "at": datetime.now(timezone.utc).isoformat(), "staff": is_staff}
    await db.tickets.update_one({"_id": ticket["_id"]},
                                {"$push": {"messages": msg},
                                 "$set": {"status": "answered" if is_staff else "open"}})
    if is_staff:
        await notify(ticket["user_id"], "support", f"Support replied to '{ticket['subject']}'", "/support")
    return pub(await db.tickets.find_one({"_id": ticket["_id"]}))


@api_router.put("/tickets/{ticket_id}/status")
async def ticket_status(ticket_id: str, request: Request, user=Depends(require(*STAFF_ROLES))):
    body = await request.json()
    if body.get("status") not in {"open", "answered", "resolved", "closed"}:
        raise HTTPException(400, "Invalid status")
    await db.tickets.update_one({"_id": oid(ticket_id)}, {"$set": {"status": body["status"]}})
    return pub(await db.tickets.find_one({"_id": oid(ticket_id)}))


# ---------------- Notifications ----------------

@api_router.get("/notifications")
async def get_notifications(user=Depends(current_user)):
    notifs = await db.notifications.find({"user_id": oid(user["id"])}).sort("created_at", -1).to_list(100)
    return [pub(n) for n in notifs]


@api_router.post("/notifications/read")
async def read_notifications(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": oid(user["id"])}, {"$set": {"read": True}})
    return {"ok": True}


# ---------------- Reports / Moderation ----------------

@api_router.post("/reports")
async def create_report(request: Request, user=Depends(current_user)):
    body = await request.json()
    if body["target_type"] == "reel":
        exists = await db.reels.find_one({"_id": oid(body["target_id"])})
    elif body["target_type"] == "product":
        exists = await db.products.find_one({"_id": oid(body["target_id"])})
    else:
        exists = await db.users.find_one({"_id": oid(body["target_id"])})
    if not exists:
        raise HTTPException(404, "Report target not found")
    doc = {"reporter_id": oid(user["id"]), "reporter_name": user["name"],
           "target_type": body["target_type"], "target_id": body["target_id"],
           "reason": body["reason"], "status": "open",
           "created_at": datetime.now(timezone.utc)}
    res = await db.reports.insert_one(doc)
    return pub(await db.reports.find_one({"_id": res.inserted_id}))


@api_router.get("/admin/overview")
async def admin_overview(user=Depends(require(*STAFF_ROLES))):
    payments = await db.payments.find({"escrow": "released"}).to_list(10000)
    revenue = sum(p["amount"] for p in payments)
    return {
        "users": await db.users.count_documents({}),
        "products": await db.products.count_documents({}),
        "reels": await db.reels.count_documents({}),
        "orders": await db.orders.count_documents({}),
        "open_tickets": await db.tickets.count_documents({"status": {"$in": ["open", "answered"]}}),
        "pending_moderation": await db.reels.count_documents({"status": "pending"}) + await db.products.count_documents({"status": "pending"}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
        "revenue": revenue,
        "commission": round(revenue * PLATFORM_FEE_RATE, 2),
    }


@api_router.get("/admin/users")
async def admin_users(q: str = "", user=Depends(require(*ADMIN_ROLES, "support"))):
    query = {"name": {"$regex": q, "$options": "i"}} if q else {}
    users = await db.users.find(query).limit(200).to_list(200)
    return [public_user(u) for u in users]


@api_router.put("/admin/users/{user_id}/status")
async def admin_user_status(user_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    if body.get("status") not in {"active", "suspended"}:
        raise HTTPException(400, "Invalid status")
    await db.users.update_one({"_id": oid(user_id)}, {"$set": {"status": body["status"]}})
    return public_user(await db.users.find_one({"_id": oid(user_id)}))


@api_router.post("/admin/users")
async def admin_create_user(request: Request, user=Depends(require("super_admin"))):
    body = await request.json()
    role = body.get("role", "admin")
    if role not in {"admin", "support"}:
        raise HTTPException(400, "Can only create admin or support accounts")
    email = body["email"].lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {"email": email, "password_hash": hash_password(body["password"]), "name": body["name"],
           "role": role, "status": "active", "followers": [], "following": [], "bio": "",
           "avatar": "", "banner": "", "specialty": "", "mobile": "",
           "courier_preference": "Delhivery", "created_at": datetime.now(timezone.utc)}
    await db.users.insert_one(doc)
    return {"ok": True}


@api_router.get("/admin/moderation")
async def moderation_queue(type: str = "reels", user=Depends(require(*STAFF_ROLES))):
    coll = db.reels if type == "reels" else db.products
    items = await coll.find({"status": "pending"}).sort("created_at", -1).to_list(100)
    return [pub(i) for i in items]


@api_router.post("/admin/moderation/{type}/{item_id}")
async def moderate(type: str, item_id: str, request: Request, user=Depends(require(*STAFF_ROLES))):
    body = await request.json()
    action = body.get("action")
    if action not in {"approve", "reject"}:
        raise HTTPException(400, "Invalid action")
    coll = db.reels if type == "reels" else db.products
    status = "approved" if action == "approve" else "rejected"
    await coll.update_one({"_id": oid(item_id)}, {"$set": {"status": status}})
    item = await coll.find_one({"_id": oid(item_id)})
    owner = item.get("creator_id") or item.get("seller_id")
    if owner:
        await notify(owner, "moderation", f"Your {type[:-1]} was {status}", "/studio")
    return pub(item)


@api_router.get("/admin/reports")
async def list_reports(user=Depends(require(*STAFF_ROLES))):
    reports = await db.reports.find().sort("created_at", -1).to_list(200)
    return [pub(r) for r in reports]


@api_router.post("/admin/reports/{report_id}/resolve")
async def resolve_report(report_id: str, user=Depends(require(*STAFF_ROLES))):
    await db.reports.update_one({"_id": oid(report_id)}, {"$set": {"status": "resolved"}})
    return {"ok": True}


@api_router.post("/admin/categories")
async def add_category(request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    doc = {"name": body["name"], "subcategories": body.get("subcategories", []),
           "created_at": datetime.now(timezone.utc)}
    res = await db.categories.insert_one(doc)
    return pub(await db.categories.find_one({"_id": res.inserted_id}))


# ---------------- Analytics ----------------

@api_router.get("/analytics/creator")
async def creator_analytics(user=Depends(current_user)):
    seller_ids = [oid(user["id"])]
    if user.get("company_id"):
        seller_ids.append(oid(user["company_id"]))
    orders = await db.orders.find({"items.seller_id": {"$in": seller_ids}, "status": {"$nin": ["payment_pending"]}}).to_list(1000)
    total_sales = 0.0
    order_count = 0
    daily = {}
    for o in orders:
        mine = [i for i in o["items"] if i["seller_id"] in seller_ids]
        if not mine:
            continue
        order_count += 1
        amount = sum(i["price"] * i["qty"] for i in mine)
        total_sales += amount
        day = o["created_at"].strftime("%d %b") if isinstance(o["created_at"], datetime) else ""
        daily[day] = daily.get(day, 0) + amount
    released = await db.payments.find({"escrow": "released"}).to_list(10000)
    order_map = {str(o["_id"]): o for o in await db.orders.find({}).to_list(10000)}
    earnings = 0.0
    for p in released:
        o = order_map.get(p["ref_id"])
        if o:
            mine = sum(i["price"] * i["qty"] for i in o["items"] if i["seller_id"] in seller_ids)
            earnings += mine * (1 - PLATFORM_FEE_RATE)
        elif p["purpose"] == "custom":
            cr = await db.custom_requests.find_one({"_id": oid(p["ref_id"])})
            if cr and (str(cr["target_id"]) in {user["id"], user.get("company_id", "")}):
                earnings += p["amount"] * (1 - PLATFORM_FEE_RATE)
    followers = len(user.get("followers", [])) if isinstance(user.get("followers"), list) else 0
    me_doc = await db.users.find_one({"_id": oid(user["id"])})
    followers = len(me_doc.get("followers", [])) if me_doc else 0
    reel_count = await db.reels.count_documents({"creator_id": {"$in": seller_ids}})
    product_count = await db.products.count_documents({"seller_id": {"$in": seller_ids}})
    custom_in = await db.custom_requests.count_documents(
        {"target_id": {"$in": [user["id"], user.get("company_id", "")]}, "status": {"$nin": ["submitted", "under_review"]}})
    return {
        "total_sales": round(total_sales, 2), "earnings": round(earnings, 2),
        "orders": order_count, "followers": followers, "reels": reel_count,
        "products": product_count, "custom_requests": custom_in,
        "chart": [{"day": k, "sales": round(v, 2)} for k, v in list(daily.items())[-14:]],
    }


# ---------------- Search ----------------

@api_router.get("/search")
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


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed(db)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
