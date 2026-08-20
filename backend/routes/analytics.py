

from deps import (
    PLATFORM_FEE_RATE,
    APIRouter,
    Depends,
    _razorpay,  # noqa: F401
    current_user,
    datetime,
    db,
    oid,
)

router = APIRouter()


@router.get("/analytics/creator")
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
