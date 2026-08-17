import os
import secrets
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from bson import ObjectId
from fastapi import HTTPException, Request

JWT_ALGORITHM = "HS256"
ALL_ROLES = [
    "super_admin", "admin", "artist", "company_owner", "company_admin",
    "company_artist", "retailer", "customer", "support",
]
CREATOR_ROLES = {"artist", "company_owner", "company_admin", "company_artist"}
ADMIN_ROLES = {"super_admin", "admin"}
STAFF_ROLES = {"super_admin", "admin", "support"}
COURIERS = ["Ekart", "Delhivery", "DTDC", "Blue Dart", "India Post", "Shiprocket"]


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role, "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id, "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, user_id: str, email: str, role: str):
    response.set_cookie("access_token", create_access_token(user_id, email, role),
                        httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user_id),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    if doc.get("company_id"):
        doc["company_id"] = str(doc["company_id"])
    return doc


async def get_current_user(request: Request, db) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")
    return public_user(user)


def new_otp() -> str:
    return f"{secrets.randbelow(900000) + 100000}"
