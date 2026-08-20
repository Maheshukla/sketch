from dotenv import load_dotenv

load_dotenv()


import json
import logging
import os
import random
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import requests
from bson import ObjectId
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import Response as RawResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware

from auth import (
    ADMIN_ROLES,
    ALL_ROLES,
    COURIERS,
    CREATOR_ROLES,
    STAFF_ROLES,
    create_access_token,
    get_current_user,
    hash_password,
    new_otp,
    public_user,
    set_auth_cookies,
    verify_password,
)
from seed import seed
from storage import get_object, init_storage, put_object, upload_path

mongo_url = os.environ["MONGO_URL"]


client = AsyncIOMotorClient(mongo_url)


db = client[os.environ["DB_NAME"]]


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


logger = logging.getLogger(__name__)


PLATFORM_FEE_RATE = 0.10


TAX_RATE = 0.05


SHIPPING_FLAT = 99.0


PACKAGING_FLAT = 49.0


ADVANCE_RATE = 0.30


RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")


RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")


COURIER_RATES = {"Delhivery": 99.0, "Ekart": 89.0, "DTDC": 95.0,
                 "Blue Dart": 129.0, "India Post": 79.0, "Shiprocket": 105.0}


try:
    import razorpay as _razorpay
except ImportError:
    _razorpay = None


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


async def audit(actor: dict, action: str, target: str, meta: dict = None):
    await db.audit_logs.insert_one({
        "actor_id": oid(actor["id"]), "actor_name": actor["name"], "actor_role": actor["role"],
        "action": action, "target": str(target), "meta": meta or {},
        "at": datetime.now(timezone.utc),
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


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "customer"
    mobile: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OtpRequestIn(BaseModel):
    identifier: str


class OtpVerifyIn(BaseModel):
    identifier: str
    otp: str
    name: str = ""
    role: str = "customer"


ADDRESS_REQUIRED = ["full_name", "mobile", "house", "area", "city", "state", "pin"]


def validate_address(body: dict, partial: bool = False) -> dict:
    errors = []
    if not partial:
        for f in ADDRESS_REQUIRED:
            if not str(body.get(f, "")).strip():
                errors.append(f"{f.replace('_', ' ')} is required")
    if "mobile" in body:
        m = re.sub(r"^\+91", "", str(body.get("mobile", "")).replace(" ", ""))
        if not re.fullmatch(r"[6-9]\d{9}", m):
            errors.append("Valid 10-digit Indian mobile number required")
        body["mobile"] = m
    if "pin" in body and not re.fullmatch(r"\d{6}", str(body.get("pin", ""))):
        errors.append("6-digit PIN code required")
    if "label" in body and body["label"] not in {"Home", "Work", "Other"}:
        errors.append("Label must be Home, Work or Other")
    if errors:
        raise HTTPException(400, "; ".join(errors))
    return body


def format_address(a: dict) -> str:
    if "house" in a:
        return f"{a.get('full_name', '')}, {a.get('house', '')}, {a.get('area', '')}, {a.get('city', '')}, {a.get('state', '')} — {a.get('pin', '')}"
    return f"{a.get('label', '')}: {a.get('line', '')}, {a.get('city', '')} — {a.get('pin', '')}"


ALLOWED_SETTINGS = {"private_profile", "show_activity", "notify_orders", "notify_social",
                    "notify_marketing", "default_payment", "default_address",
                    "notifications", "theme", "courier_preference", "privacy"}


class CompanyIn(BaseModel):
    name: str
    description: str = ""


async def company_role(user, company_id):
    company = await db.companies.find_one({"_id": oid(company_id)})
    if not company:
        raise HTTPException(404, "Company not found")
    for m in company["members"]:
        if str(m["user_id"]) == user["id"]:
            return company, m["role"]
    raise HTTPException(403, "Not a company member")


KYC_FIELDS = {"business_name", "business_type", "gstin", "msme", "pan", "govt_id_type",
              "govt_id", "address", "contact_name", "contact_phone", "account_number", "ifsc",
              "owner_name"}


KYC_STATUSES = {"draft", "submitted", "under_review", "approved", "rejected", "more_info", "suspended"}


def mask_secret(v):
    if not v:
        return v
    s = str(v)
    return "*" * max(len(s) - 4, 0) + s[-4:]


def public_verification(doc):
    out = pub(doc)
    for k in ("pan", "govt_id", "gstin", "msme", "account_number", "ifsc"):
        if out.get(k):
            out[k] = mask_secret(out[k])
    return out


async def seller_verified(user) -> bool:
    if user["role"] == "retailer":
        v = await db.verifications.find_one({"subject_id": user["id"], "status": "approved"})
        return bool(v)
    if user["role"].startswith("company_") and user.get("company_id"):
        v = await db.verifications.find_one({"subject_id": user["company_id"], "status": "approved"})
        return bool(v)
    return True


class PortfolioIn(BaseModel):
    title: str
    description: str = ""
    images: list[str] = []
    category: str = ""


class ReelIn(BaseModel):
    caption: str
    media_url: str
    media_type: str = "image"
    product_id: str = ""


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
    discount_pct: int = 0
    variations: list[dict] = []


async def release_escrow(ref_id: str, purpose: str):
    payment = await db.payments.find_one({"ref_id": ref_id, "purpose": purpose, "escrow": "held"})
    if payment:
        await db.payments.update_one({"_id": payment["_id"]}, {"$set": {"escrow": "released", "released_at": datetime.now(timezone.utc)}})


ORDER_TRANSITIONS = {
    "accept": ("placed", "accepted", "seller"),
    "reject": ("placed", "cancelled", "seller"),
    "processing": ("accepted", "processing", "seller"),
    "shipped": (("accepted", "processing"), "shipped", "seller"),
    "picked_up": ("shipped", "shipped", "seller"),
    "out_for_delivery": ("shipped", "out_for_delivery", "seller"),
    "delivered": (("shipped", "out_for_delivery"), "delivered", "buyer"),
    "completed": ("delivered", "completed", "buyer"),
}


async def hydrate_collection(c):
    out = pub(c)
    products = []
    for pid in c.get("product_ids", [])[:12]:
        p = await db.products.find_one({"_id": pid})
        if p:
            products.append(pub(p))
    out["products"] = products
    return out


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


async def cr_transition(cr, status, by):
    history = cr.get("history", []) + [{"status": status, "at": datetime.now(timezone.utc).isoformat(), "by": by}]
    await db.custom_requests.update_one({"_id": cr["_id"]}, {"$set": {"status": status, "history": history}})


async def cr_creator_check(user, cr):
    if cr["target_type"] == "company":
        if user["role"] not in {"company_owner", "company_admin"}:
            raise HTTPException(403, "Only company owner/admin can handle requests")
        company, _ = await company_role(user, cr["target_id"])
    elif str(cr.get("target_id")) != user["id"]:
        raise HTTPException(403, "Not your request")


async def cr_participant_check(user, cr):
    if user["role"] in STAFF_ROLES or str(cr["customer_id"]) == user["id"]:
        return
    if cr["target_type"] == "company":
        company = await db.companies.find_one({"_id": oid(cr["target_id"])})
        if company and any(str(m["user_id"]) == user["id"] for m in company["members"]):
            return
    elif str(cr["target_id"]) == user["id"]:
        return
    raise HTTPException(403, "Not a participant")


async def chat_access(user, thread):
    if user["id"] in thread.get("participants", []):
        return
    if thread.get("kind") == "support" and user["role"] in STAFF_ROLES:
        return
    if thread.get("kind") == "order" and user.get("company_id") and user["company_id"] in thread.get("participants", []):
        return
    raise HTTPException(403, "Not a participant")


SHIPROCKET_EMAIL = os.environ.get("SHIPROCKET_EMAIL", "")


SHIPROCKET_PASSWORD = os.environ.get("SHIPROCKET_PASSWORD", "")


def shiprocket_token():
    if not (SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD):
        return ""
    try:
        r = requests.post("https://apiv2.shiprocket.in/v1/external/auth/login",
                          json={"email": SHIPROCKET_EMAIL, "password": SHIPROCKET_PASSWORD}, timeout=10)
        return r.json().get("token", "")
    except Exception as e:
        logger.error(f"Shiprocket auth failed: {e}")
        return ""


__all__ = [
    "ADDRESS_REQUIRED",
    "ADMIN_ROLES",
    "ADVANCE_RATE",
    "ALLOWED_SETTINGS",
    "ALL_ROLES",
    "COURIERS",
    "COURIER_RATES",
    "CREATOR_ROLES",
    "CR_FLOW",
    "KYC_FIELDS",
    "KYC_STATUSES",
    "ORDER_TRANSITIONS",
    "PACKAGING_FLAT",
    "PLATFORM_FEE_RATE",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "SHIPPING_FLAT",
    "SHIPROCKET_EMAIL",
    "SHIPROCKET_PASSWORD",
    "STAFF_ROLES",
    "TAX_RATE",
    "APIRouter",
    "AsyncIOMotorClient",
    "BaseModel",
    "CORSMiddleware",
    "CompanyIn",
    "CustomRequestIn",
    "Depends",
    "EmailStr",
    "FastAPI",
    "File",
    "HTTPException",
    "LoginIn",
    "ObjectId",
    "OtpRequestIn",
    "OtpVerifyIn",
    "PortfolioIn",
    "ProductIn",
    "Query",
    "RawResponse",
    "ReelIn",
    "RegisterIn",
    "Request",
    "Response",
    "UploadFile",
    "audit",
    "chat_access",
    "client",
    "company_role",
    "cr_creator_check",
    "cr_participant_check",
    "cr_transition",
    "create_access_token",
    "current_user",
    "datetime",
    "db",
    "fee_breakdown",
    "format_address",
    "get_current_user",
    "get_object",
    "hash_password",
    "hydrate_collection",
    "init_storage",
    "json",
    "load_dotenv",
    "logger",
    "logging",
    "mask_secret",
    "mongo_url",
    "new_otp",
    "notify",
    "oid",
    "os",
    "pub",
    "public_user",
    "public_verification",
    "put_object",
    "pyjwt",
    "random",
    "re",
    "release_escrow",
    "requests",
    "require",
    "require_avatar",
    "secrets",
    "seed",
    "seller_verified",
    "set_auth_cookies",
    "shiprocket_token",
    "timedelta",
    "timezone",
    "upload_path",
    "uuid",
    "validate_address",
    "verify_password",
]


def require_avatar(user):
    if not user.get("avatar"):
        raise HTTPException(400, "Add a profile photo before publishing — every public profile needs a profile image")
