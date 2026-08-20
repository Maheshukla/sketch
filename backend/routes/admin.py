

from deps import (
    ADMIN_ROLES,
    PLATFORM_FEE_RATE,
    STAFF_ROLES,
    APIRouter,
    Depends,
    HTTPException,
    Request,
    _razorpay,  # noqa: F401
    audit,
    current_user,
    datetime,
    db,
    hash_password,
    notify,
    oid,
    pub,
    public_user,
    require,
    timezone,
)

router = APIRouter()


@router.post("/reports")
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


@router.get("/admin/overview")
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


@router.get("/admin/users")
async def admin_users(q: str = "", role: str = "", user=Depends(require(*ADMIN_ROLES, "support"))):
    query = {"name": {"$regex": q, "$options": "i"}} if q else {}
    if role:
        query["role"] = role
    users = await db.users.find(query).limit(200).to_list(200)
    return [public_user(u) for u in users]


@router.put("/admin/users/{user_id}/status")
async def admin_user_status(user_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    if body.get("status") not in {"active", "suspended"}:
        raise HTTPException(400, "Invalid status")
    await db.users.update_one({"_id": oid(user_id)}, {"$set": {"status": body["status"]}})
    await audit(user, f"user_{body['status']}", user_id, {"email": (await db.users.find_one({"_id": oid(user_id)}))["email"]})
    return public_user(await db.users.find_one({"_id": oid(user_id)}))


@router.post("/admin/users/{user_id}/verify")
async def admin_verify_user(user_id: str, user=Depends(require(*ADMIN_ROLES))):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    new_val = not target.get("verified", False)
    await db.users.update_one({"_id": target["_id"]}, {"$set": {"verified": new_val}})
    return {"verified": new_val}


@router.get("/admin/audit-logs")
async def get_audit_logs(user=Depends(require(*ADMIN_ROLES))):
    return [pub(a) for a in await db.audit_logs.find().sort("at", -1).to_list(300)]


@router.post("/admin/users")
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


@router.get("/admin/moderation")
async def moderation_queue(type: str = "reels", user=Depends(require(*STAFF_ROLES))):
    coll = db.reels if type == "reels" else db.products
    items = await coll.find({"status": "pending"}).sort("created_at", -1).to_list(100)
    return [pub(i) for i in items]


@router.post("/admin/moderation/{type}/{item_id}")
async def moderate(type: str, item_id: str, request: Request, user=Depends(require(*STAFF_ROLES))):
    body = await request.json()
    action = body.get("action")
    if action not in {"approve", "reject"}:
        raise HTTPException(400, "Invalid action")
    coll = db.reels if type == "reels" else db.products
    status = "approved" if action == "approve" else "rejected"
    await coll.update_one({"_id": oid(item_id)}, {"$set": {"status": status}})
    await audit(user, f"moderation_{action}", item_id, {"type": type})
    item = await coll.find_one({"_id": oid(item_id)})
    owner = item.get("creator_id") or item.get("seller_id")
    if owner:
        await notify(owner, "moderation", f"Your {type[:-1]} was {status}", "/studio")
    return pub(item)


@router.get("/admin/reports/{report_id}")
async def report_detail(report_id: str, user=Depends(require(*STAFF_ROLES))):
    r = await db.reports.find_one({"_id": oid(report_id)})
    if not r:
        raise HTTPException(404, "Report not found")
    out = pub(r)
    reporter = await db.users.find_one({"_id": r["reporter_id"]})
    out["reporter"] = {"id": str(reporter["_id"]), "name": reporter["name"], "email": reporter["email"]} if reporter else None
    content = None
    reported_user = None
    if r["target_type"] == "reel":
        content = await db.reels.find_one({"_id": oid(r["target_id"])})
        if content:
            reported_user = await db.users.find_one({"_id": content["creator_id"]})
    elif r["target_type"] == "product":
        content = await db.products.find_one({"_id": oid(r["target_id"])})
        if content:
            reported_user = await db.users.find_one({"_id": content["seller_id"]})
            if not reported_user:
                comp = await db.companies.find_one({"_id": content["seller_id"]})
                if comp:
                    reported_user = await db.users.find_one({"_id": comp["owner_id"]})
    else:
        reported_user = await db.users.find_one({"_id": oid(r["target_id"])})
    out["content"] = pub(content) if content else None
    if reported_user:
        out["reported_user"] = {"id": str(reported_user["_id"]), "name": reported_user["name"],
                                "email": reported_user["email"], "role": reported_user["role"],
                                "status": reported_user.get("status", "active")}
        owner_content_ids = [str(r["target_id"])]
        async for c in db.reels.find({"creator_id": reported_user["_id"]}, {"_id": 1}):
            owner_content_ids.append(str(c["_id"]))
        async for c in db.products.find({"seller_id": reported_user["_id"]}, {"_id": 1}):
            owner_content_ids.append(str(c["_id"]))
        out["previous_violations"] = await db.reports.count_documents(
            {"status": "resolved", "target_id": {"$in": owner_content_ids}})
    out["related_reports"] = await db.reports.count_documents(
        {"target_id": r["target_id"], "_id": {"$ne": r["_id"]}})
    out["notes"] = r.get("notes", [])
    return out


@router.put("/admin/reports/{report_id}")
async def update_report(report_id: str, request: Request, user=Depends(require(*STAFF_ROLES))):
    body = await request.json()
    update = {}
    if body.get("status"):
        if body["status"] not in {"open", "under_review", "resolved", "rejected", "escalated"}:
            raise HTTPException(400, "Invalid status")
        update["status"] = body["status"]
    note = (body.get("note") or "").strip()
    if note:
        await db.reports.update_one({"_id": oid(report_id)},
                                    {"$push": {"notes": {"by": user["name"], "text": note,
                                                         "at": datetime.now(timezone.utc).isoformat()}}})
    if update:
        update["handled_by"] = user["name"]
        update["handled_at"] = datetime.now(timezone.utc)
        await db.reports.update_one({"_id": oid(report_id)}, {"$set": update})
    return pub(await db.reports.find_one({"_id": oid(report_id)}))


@router.post("/admin/reports/{report_id}/action")
async def report_action(report_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    action = body.get("action")
    if action not in {"remove_content", "restrict_content", "suspend_user", "warn_user"}:
        raise HTTPException(400, "Invalid action")
    r = await db.reports.find_one({"_id": oid(report_id)})
    if not r:
        raise HTTPException(404, "Report not found")
    owner_id = None
    if r["target_type"] == "reel":
        reel = await db.reels.find_one({"_id": oid(r["target_id"])})
        owner_id = reel["creator_id"] if reel else None
        if action in {"remove_content", "restrict_content"} and reel:
            await db.reels.update_one({"_id": reel["_id"]},
                                      {"$set": {"status": "rejected" if action == "remove_content" else "restricted"}})
    elif r["target_type"] == "product":
        prod = await db.products.find_one({"_id": oid(r["target_id"])})
        owner_id = prod["seller_id"] if prod else None
        if action in {"remove_content", "restrict_content"} and prod:
            await db.products.update_one({"_id": prod["_id"]},
                                         {"$set": {"status": "rejected" if action == "remove_content" else "restricted"}})
    else:
        owner_id = oid(r["target_id"])
    if action == "suspend_user" and owner_id:
        await db.users.update_one({"_id": owner_id}, {"$set": {"status": "suspended"}})
    if action == "warn_user" and owner_id:
        await notify(owner_id, "warning", f"Policy warning: your content was reported ({r['reason'][:80]})", "/support")
    if owner_id:
        await notify(owner_id, "moderation", f"Moderation action on your {r['target_type']}: {action.replace('_', ' ')}", "/studio")
    await db.reports.update_one({"_id": r["_id"]}, {"$push": {"notes": {
        "by": user["name"], "text": f"Action: {action}", "at": datetime.now(timezone.utc).isoformat()}}})
    return {"ok": True, "action": action}


@router.get("/admin/orders")
async def admin_orders(user=Depends(require(*STAFF_ROLES))):
    return [pub(o) for o in await db.orders.find().sort("created_at", -1).to_list(300)]


@router.get("/admin/payments")
async def admin_payments(user=Depends(require(*STAFF_ROLES))):
    return [pub(p) for p in await db.payments.find().sort("created_at", -1).to_list(300)]


@router.get("/admin/companies")
async def admin_companies(user=Depends(require(*STAFF_ROLES))):
    comps = await db.companies.find().to_list(100)
    out = []
    for c in comps:
        v = await db.verifications.find_one({"subject_id": str(c["_id"])})
        out.append({**pub(c), "verification_status": v["status"] if v else "draft"})
    return out


@router.get("/admin/verifications")
async def admin_verifications(status: str = "", user=Depends(require(*STAFF_ROLES))):
    q = {"status": status} if status else {}
    docs = await db.verifications.find(q).sort("updated_at", -1).to_list(200)
    await db.kyc_access_logs.insert_one({"admin_id": oid(user["id"]), "admin_name": user["name"],
                                         "filter": status, "at": datetime.now(timezone.utc)})
    return [pub(d) for d in docs]


@router.get("/admin/verifications/{vid}")
async def admin_verification_detail(vid: str, user=Depends(require(*STAFF_ROLES))):
    v = await db.verifications.find_one({"_id": oid(vid)})
    if not v:
        raise HTTPException(404, "Verification not found")
    await db.kyc_access_logs.insert_one({"admin_id": oid(user["id"]), "admin_name": user["name"],
                                         "verification_id": vid, "at": datetime.now(timezone.utc)})
    return pub(v)


@router.post("/admin/verifications/{vid}/documents/{doc_id}")
async def review_document(vid: str, doc_id: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    action = body.get("action")
    if action not in {"verify", "invalid", "request_replacement"}:
        raise HTTPException(400, "Invalid document action")
    v = await db.verifications.find_one({"_id": oid(vid)})
    if not v:
        raise HTTPException(404, "Verification not found")
    status_map = {"verify": "verified", "invalid": "invalid", "request_replacement": "replacement_requested"}
    res = await db.verifications.update_one(
        {"_id": v["_id"], "documents.id": doc_id},
        {"$set": {"documents.$.status": status_map[action], "documents.$.note": body.get("note", ""),
                  "documents.$.reviewed_by": user["name"]},
         "$push": {"history": {"action": f"document_{action}", "by": user["name"], "document": doc_id,
                               "reason": body.get("note", ""), "at": datetime.now(timezone.utc)}}})
    if not res.matched_count:
        raise HTTPException(404, "Document not found")
    target_uid = v["subject_id"]
    if v["subject_type"] == "company":
        company = await db.companies.find_one({"_id": oid(target_uid)})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "kyc", f"Document {status_map[action].replace('_', ' ')}: {body.get('note', '')}", "/verification")
    else:
        await notify(oid(target_uid), "kyc", f"A verification document was marked {status_map[action].replace('_', ' ')}", "/verification")
    await audit(user, f"kyc_document_{action}", vid, {"document": doc_id})
    return pub(await db.verifications.find_one({"_id": v["_id"]}))


@router.post("/admin/verifications/{vid}/review")
async def review_verification(vid: str, request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    mapping = {"approve": "approved", "reject": "rejected", "more_info": "more_info",
               "suspend": "suspended", "under_review": "under_review"}
    action = body.get("action")
    if action not in mapping:
        raise HTTPException(400, "Invalid action")
    note = (body.get("note") or "").strip()
    if action in {"reject", "more_info"} and not note:
        raise HTTPException(400, "A reason/note is required for this action")
    v = await db.verifications.find_one({"_id": oid(vid)})
    if not v:
        raise HTTPException(404, "Verification not found")
    await db.verifications.update_one({"_id": v["_id"]}, {
        "$set": {"status": mapping[action], "reviewed_by": user["name"],
                 "reviewed_at": datetime.now(timezone.utc)},
        "$push": {"notes": {"by": user["name"], "text": note,
                            "at": datetime.now(timezone.utc).isoformat()},
                  "history": {"action": mapping[action], "by": user["name"], "reason": note,
                              "at": datetime.now(timezone.utc)}}})
    await audit(user, f"kyc_{mapping[action]}", vid, {"subject": v.get("subject_name"), "reason": note})
    if mapping[action] in {"rejected", "suspended"}:
        await db.products.update_many({"seller_id": oid(v["subject_id"])},
                                      {"$set": {"status": "suspended"}})
    if v["subject_type"] == "company":
        await db.companies.update_one({"_id": oid(v["subject_id"])},
                                      {"$set": {"verified": mapping[action] == "approved"}})
        company = await db.companies.find_one({"_id": oid(v["subject_id"])})
        for m in (company["members"] if company else []):
            if m["role"] in {"owner", "admin"}:
                await notify(m["user_id"], "kyc",
                             f"Company verification {mapping[action].replace('_', ' ')}", "/verification")
    else:
        await notify(oid(v["subject_id"]), "kyc",
                     f"Your verification was {mapping[action].replace('_', ' ')}", "/verification")
    return pub(await db.verifications.find_one({"_id": v["_id"]}))


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(require("super_admin"))):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "super_admin":
        raise HTTPException(400, "Cannot delete super admin")
    await db.users.delete_one({"_id": target["_id"]})
    return {"ok": True}


@router.get("/admin/reports")
async def list_reports(user=Depends(require(*STAFF_ROLES))):
    reports = await db.reports.find().sort("created_at", -1).to_list(200)
    return [pub(r) for r in reports]


@router.post("/admin/reports/{report_id}/resolve")
async def resolve_report(report_id: str, user=Depends(require(*STAFF_ROLES))):
    await db.reports.update_one({"_id": oid(report_id)}, {"$set": {"status": "resolved"}})
    return {"ok": True}


@router.post("/admin/categories")
async def add_category(request: Request, user=Depends(require(*ADMIN_ROLES))):
    body = await request.json()
    doc = {"name": body["name"], "subcategories": body.get("subcategories", []),
           "created_at": datetime.now(timezone.utc)}
    res = await db.categories.insert_one(doc)
    return pub(await db.categories.find_one({"_id": res.inserted_id}))
