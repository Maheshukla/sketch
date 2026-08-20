

from deps import (
    APIRouter,
    Depends,
    HTTPException,
    LoginIn,
    ObjectId,
    OtpRequestIn,
    OtpVerifyIn,
    RegisterIn,
    Request,
    Response,
    _razorpay,  # noqa: F401
    create_access_token,
    current_user,
    datetime,
    db,
    hash_password,
    logger,
    new_otp,
    oid,
    os,
    public_user,
    pyjwt,
    re,
    requests,
    set_auth_cookies,
    timedelta,
    timezone,
    verify_password,
)

router = APIRouter()


@router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if data.role not in {"customer", "artist", "retailer", "company"}:
        raise HTTPException(400, "Invalid role")
    role = "company_owner" if data.role == "company" else data.role
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    base = re.sub(r"[^a-z0-9]", "", data.name.lower())[:12] or "user"
    username, n = base, 1
    while await db.users.find_one({"username": username}):
        n += 1
        username = f"{base}{n}"
    doc = {
        "email": email, "password_hash": hash_password(data.password), "name": data.name,
        "username": username, "role": role, "status": "active", "followers": [], "following": [],
        "bio": "", "avatar": "", "banner": "", "specialty": "", "mobile": data.mobile,
        "website": "", "location": "", "verified": False,
        "courier_preference": "Delhivery", "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": res.inserted_id})
    set_auth_cookies(response, str(res.inserted_id), email, role)
    return public_user(user)


@router.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked = attempt.get("locked_until")
        if locked and locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
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


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def me(user=Depends(current_user)):
    uid = oid(user["id"])
    unread = await db.notifications.count_documents({"user_id": uid, "read": False})
    cart = await db.carts.find_one({"user_id": uid})
    cart_count = sum(i["qty"] for i in cart.get("items", []) if not i.get("saved")) if cart else 0
    wl = await db.wishlists.find_one({"user_id": uid})
    wl_count = len(wl.get("product_ids", [])) if wl else 0
    msg_count = await db.notifications.count_documents({"user_id": uid, "read": False, "type": "message"})
    orders_active = await db.orders.count_documents(
        {"buyer_id": uid, "status": {"$in": ["placed", "accepted", "processing", "shipped", "out_for_delivery"]}})
    custom_pending = await db.custom_requests.count_documents(
        {"customer_id": uid, "status": {"$nin": ["completed", "declined", "rejected"]}})
    return {**user, "unread_notifications": unread, "cart_count": cart_count,
            "wishlist_count": wl_count, "message_count": msg_count,
            "orders_active": orders_active, "custom_pending": custom_pending}


@router.post("/auth/refresh")
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


@router.post("/auth/otp/request")
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


@router.post("/auth/otp/verify")
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


@router.post("/auth/google/session")
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
