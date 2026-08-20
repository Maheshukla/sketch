from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from deps import (
    client,
    db,
    init_storage,
    logger,
    os,
)
from seed import seed

app = FastAPI(title="Sketch API")

from routes.addresses import router as addresses_router
from routes.admin import router as admin_router
from routes.analytics import router as analytics_router
from routes.auth_routes import router as auth_routes_router
from routes.cart import router as cart_router
from routes.chat import router as chat_router
from routes.collections import router as collections_router
from routes.companies import router as companies_router
from routes.custom_requests import router as custom_requests_router
from routes.disputes import router as disputes_router
from routes.enquiries import router as enquiries_router
from routes.meta import router as meta_router
from routes.notifications import router as notifications_router
from routes.orders import router as orders_router
from routes.payments import router as payments_router
from routes.portfolio import router as portfolio_router
from routes.products import router as products_router
from routes.reels import router as reels_router
from routes.search import router as search_router
from routes.shipping import router as shipping_router
from routes.support import router as support_router
from routes.uploads import router as uploads_router
from routes.users import router as users_router
from routes.verification import router as verification_router
from routes.webhooks import router as webhooks_router

app.include_router(auth_routes_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(meta_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(addresses_router, prefix="/api")
app.include_router(companies_router, prefix="/api")
app.include_router(verification_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(reels_router, prefix="/api")
app.include_router(products_router, prefix="/api")
app.include_router(cart_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(collections_router, prefix="/api")
app.include_router(custom_requests_router, prefix="/api")
app.include_router(support_router, prefix="/api")
app.include_router(enquiries_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(disputes_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(shipping_router, prefix="/api")

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
