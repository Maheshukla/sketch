from fastapi import APIRouter

from deps import *
from deps import _razorpay  # noqa: F401

router = APIRouter()


@router.get("/notifications")
async def get_notifications(user=Depends(current_user)):
    notifs = await db.notifications.find({"user_id": oid(user["id"])}).sort("created_at", -1).to_list(100)
    return [pub(n) for n in notifs]


@router.post("/notifications/read")
async def read_notifications(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": oid(user["id"])}, {"$set": {"read": True}})
    return {"ok": True}
