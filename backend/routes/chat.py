from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.post("/chat/threads")
async def create_chat_thread(request: Request, user=Depends(current_user)):
    body = await request.json()
    kind = body.get("kind", "support")
    if kind == "order":
        order = await db.orders.find_one({"_id": oid(body.get("order_id", ""))})
        if not order:
            raise HTTPException(404, "Order not found")
        seller_id = str(order["items"][0]["seller_id"])
        is_buyer = str(order["buyer_id"]) == user["id"]
        if not is_buyer and seller_id != user["id"] and user.get("company_id") != seller_id:
            raise HTTPException(403, "Not a participant")
        existing = await db.chat_threads.find_one({"kind": "order", "order_id": str(order["_id"])})
        if existing:
            return pub(existing)
        seller = await db.users.find_one({"_id": oid(seller_id)}) if ObjectId.is_valid(seller_id) else None
        company = None if seller else (await db.companies.find_one({"_id": oid(seller_id)}) if ObjectId.is_valid(seller_id) else None)
        doc = {"kind": "order", "order_id": str(order["_id"]), "title": f"Order #{str(order['_id'])[-8:]}",
               "buyer_id": str(order["buyer_id"]), "seller_id": seller_id,
               "buyer_name": order.get("buyer_name", ""),
               "seller_name": (seller or {}).get("name") or (company or {}).get("name", "Seller"),
               "participants": [str(order["buyer_id"]), seller_id],
               "messages": [], "created_at": datetime.now(timezone.utc), "last_at": datetime.now(timezone.utc)}
    else:
        existing = await db.chat_threads.find_one({"kind": "support", "participants": user["id"]})
        if existing:
            return pub(existing)
        doc = {"kind": "support", "title": "Sketch Support", "participants": [user["id"]],
               "user_name": user["name"], "messages": [],
               "created_at": datetime.now(timezone.utc), "last_at": datetime.now(timezone.utc)}
    res = await db.chat_threads.insert_one(doc)
    return pub(await db.chat_threads.find_one({"_id": res.inserted_id}))


@router.get("/chat/threads")
async def list_chat_threads(user=Depends(current_user)):
    if user["role"] in STAFF_ROLES:
        q = {"$or": [{"participants": user["id"]}, {"kind": "support"}]}
    elif user.get("company_id"):
        q = {"participants": {"$in": [user["id"], user["company_id"]]}}
    else:
        q = {"participants": user["id"]}
    threads = await db.chat_threads.find(q).sort("last_at", -1).to_list(100)
    out = []
    for t in threads:
        d = pub(t)
        msgs = d.pop("messages", [])
        d["message_count"] = len(msgs)
        d["last_message"] = msgs[-1]["text"][:80] if msgs else ""
        d["last_sender"] = msgs[-1]["from"] if msgs else ""
        out.append(d)
    return out


@router.get("/chat/threads/{tid}")
async def get_chat_thread(tid: str, user=Depends(current_user)):
    t = await db.chat_threads.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Thread not found")
    await chat_access(user, t)
    return pub(t)


@router.post("/chat/threads/{tid}/messages")
async def send_chat_message(tid: str, request: Request, user=Depends(current_user)):
    t = await db.chat_threads.find_one({"_id": oid(tid)})
    if not t:
        raise HTTPException(404, "Thread not found")
    await chat_access(user, t)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Message text required")
    msg = {"id": uuid.uuid4().hex[:10], "from": user["name"], "user_id": user["id"],
           "staff": user["role"] in STAFF_ROLES, "text": text, "at": datetime.now(timezone.utc).isoformat()}
    await db.chat_threads.update_one({"_id": t["_id"]},
                                     {"$push": {"messages": msg}, "$set": {"last_at": datetime.now(timezone.utc)}})
    if t.get("kind") == "support":
        if user["role"] in STAFF_ROLES:
            await notify(oid(t["participants"][0]), "message", "Support replied to your chat", "/chat")
        else:
            staff = await db.users.find_one({"role": "support"})
            if staff:
                await notify(staff["_id"], "message", f"New support chat message from {user['name']}", "/chat")
    else:
        other = t["seller_id"] if user["id"] == t.get("buyer_id") else t["buyer_id"]
        await notify(oid(other), "message", f"New message on {t.get('title', 'order')}", "/chat")
    return msg
