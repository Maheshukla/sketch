

from deps import (
    COURIER_RATES,
    COURIERS,
    SHIPPING_FLAT,
    APIRouter,
    _razorpay,  # noqa: F401
    shiprocket_token,
)

router = APIRouter()


@router.get("/shipping/providers")
async def shipping_providers():
    return {"providers": [{"name": c, "rate": COURIER_RATES.get(c, SHIPPING_FLAT),
                           "live": c == "Shiprocket" and bool(shiprocket_token())} for c in COURIERS]}
