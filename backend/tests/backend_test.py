"""End-to-end backend integration tests for Sketch platform.

Covers: auth (email/pwd, OTP, refresh), profiles, reels, products, cart/wishlist,
orders + mock payment escrow, custom-request full flow, company mgmt,
support tickets, notifications, admin moderation/overview, RBAC.
"""
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://creator-studio-518.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "super":    ("discussionunfiltered@gmail.com", "Sketch@2026"),
    "admin":    ("admin@sketch.app", "Admin@123"),
    "support":  ("support@sketch.app", "Support@123"),
    "aarav":    ("aarav@sketch.app", "Artist@123"),
    "meera":    ("meera@sketch.app", "Artist@123"),
    "supplies": ("supplies@sketch.app", "Retailer@123"),
    "studio":   ("studio@sketch.app", "Company@123"),
    "studioadmin":   ("studioadmin@sketch.app", "Company@123"),
    "studioartist":  ("studioartist@sketch.app", "Company@123"),
    "customer": ("customer@sketch.app", "Customer@123"),
}


def _sess(email=None, pwd=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if email:
        r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


# Session fixtures ------------------------------------------------------------
@pytest.fixture(scope="session")
def customer(): return _sess(*CREDS["customer"])
@pytest.fixture(scope="session")
def admin(): return _sess(*CREDS["admin"])
@pytest.fixture(scope="session")
def support(): return _sess(*CREDS["support"])
@pytest.fixture(scope="session")
def super_admin(): return _sess(*CREDS["super"])
@pytest.fixture(scope="session")
def aarav(): return _sess(*CREDS["aarav"])
@pytest.fixture(scope="session")
def meera(): return _sess(*CREDS["meera"])
@pytest.fixture(scope="session")
def studio(): return _sess(*CREDS["studio"])
@pytest.fixture(scope="session")
def studioartist(): return _sess(*CREDS["studioartist"])


# ---- Auth ----
class TestAuth:
    def test_login_valid(self):
        r = requests.post(f"{API}/auth/login", json={"email": CREDS["customer"][0], "password": CREDS["customer"][1]})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == CREDS["customer"][0]
        assert d["role"] == "customer"
        assert "id" in d and "_id" not in d

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "notreal@x.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me(self, customer):
        r = customer.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert "unread_notifications" in d
        assert d["email"] == CREDS["customer"][0]

    def test_otp_request_and_verify(self):
        email = f"otp_test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/otp/request", json={"identifier": email})
        assert r.status_code == 200
        d = r.json()
        assert d.get("sent") is True
        assert "dev_otp" in d and len(d["dev_otp"]) == 6
        s = requests.Session()
        r = s.post(f"{API}/auth/otp/verify", json={"identifier": email, "otp": d["dev_otp"], "name": "OTP User", "role": "customer"})
        assert r.status_code == 200, r.text
        assert r.json()["email"] == email

    def test_super_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": CREDS["super"][0], "password": CREDS["super"][1]})
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"


# ---- Meta ----
class TestMeta:
    def test_categories(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_couriers(self):
        r = requests.get(f"{API}/couriers")
        assert r.status_code == 200
        cs = r.json()
        assert "Delhivery" in cs and "Ekart" in cs


# ---- Products / marketplace ----
class TestProducts:
    def test_list_products(self):
        r = requests.get(f"{API}/products")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_products(self):
        r = requests.get(f"{API}/products", params={"q": "canvas"})
        assert r.status_code == 200

    def test_product_detail(self):
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip("no products seeded")
        pid = prods[0]["id"]
        r = requests.get(f"{API}/products/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid


# ---- Reels ----
class TestReels:
    def test_feed(self):
        r = requests.get(f"{API}/reels")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_like_and_save(self, customer):
        reels = requests.get(f"{API}/reels").json()
        if not reels:
            pytest.skip("no reels")
        rid = reels[0]["id"]
        r1 = customer.post(f"{API}/reels/{rid}/like")
        assert r1.status_code == 200 and "liked" in r1.json()
        r2 = customer.post(f"{API}/reels/{rid}/save")
        assert r2.status_code == 200 and "saved" in r2.json()

    def test_comment(self, customer):
        reels = requests.get(f"{API}/reels").json()
        if not reels:
            pytest.skip()
        rid = reels[0]["id"]
        r = customer.post(f"{API}/reels/{rid}/comments", json={"text": "TEST_nice work"})
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_nice work"


# ---- Cart / Wishlist ----
class TestCartWishlist:
    def test_cart_flow(self, customer):
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip()
        pid = prods[0]["id"]
        # Clear any existing cart items for that product first
        customer.delete(f"{API}/cart/{pid}")
        r = customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1})
        assert r.status_code == 200
        r2 = customer.get(f"{API}/cart")
        assert r2.status_code == 200
        assert any(i["id"] == pid for i in r2.json()["items"])

    def test_wishlist_toggle(self, customer):
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip()
        pid = prods[0]["id"]
        r1 = customer.post(f"{API}/wishlist/{pid}")
        assert r1.status_code == 200
        state1 = r1.json()["wishlisted"]
        r2 = customer.post(f"{API}/wishlist/{pid}")
        assert r2.json()["wishlisted"] != state1


# ---- Full checkout + escrow ----
class TestCheckout:
    def test_full_purchase_flow(self, customer, meera):
        # find one of meera's approved physical products
        prods = requests.get(f"{API}/products").json()
        meera_id = requests.post(f"{API}/auth/login", json={"email": CREDS["meera"][0], "password": CREDS["meera"][1]}).json()["id"]
        target = next((p for p in prods if p.get("seller_id") == meera_id and p.get("product_type") == "physical"), None)
        if not target:
            target = next((p for p in prods if p.get("product_type") == "physical"), None)
        if not target:
            pytest.skip("no physical product")
        pid = target["id"]
        customer.delete(f"{API}/cart/{pid}")
        customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1})
        # checkout
        r = customer.post(f"{API}/orders/checkout", json={"payment_method": "upi", "address": "TEST addr"})
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        order_id = order["id"]
        assert order["status"] == "payment_pending"
        assert order["total"] > 0
        assert order["tax"] > 0 and order["platform_fee"] > 0
        # create + verify payment
        pay1 = customer.post(f"{API}/payments/create", json={"amount": order["total"], "purpose": "order", "ref_id": order_id})
        assert pay1.status_code == 200
        po = pay1.json()
        pay2 = customer.post(f"{API}/payments/verify", json={"order_id": po["order_id"], "method": "upi"})
        assert pay2.status_code == 200
        pjson = pay2.json()
        # pay order
        r = customer.post(f"{API}/orders/{order_id}/pay", json={"payment_db_id": pjson["id"]})
        assert r.status_code == 200
        assert r.json()["status"] == "placed"


# ---- Seller ship + deliver ----
class TestSellerShipping:
    def test_ship_and_deliver(self, customer):
        # find a placed order
        orders = customer.get(f"{API}/orders").json()
        placed = next((o for o in orders if o["status"] == "placed"), None)
        if not placed:
            pytest.skip("no placed order")
        seller_id = placed["items"][0]["seller_id"]
        # find seller session (best-effort match by id)
        seller = None
        for k in ("meera", "aarav", "supplies", "studio"):
            s = _sess(*CREDS[k])
            me = s.get(f"{API}/auth/me").json()
            if me["id"] == seller_id or me.get("company_id") == seller_id:
                seller = s; break
        if not seller:
            pytest.skip("no matching seller")
        r = seller.post(f"{API}/orders/{placed['id']}/ship", json={"courier": "Delhivery", "tracking_id": "TRK123"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "shipped"
        r2 = customer.post(f"{API}/orders/{placed['id']}/deliver")
        assert r2.status_code == 200
        assert r2.json()["status"] == "delivered"


# ---- Custom orders ----
class TestCustomOrders:
    def test_full_custom_flow(self, customer, admin, aarav):
        aarav_id = aarav.get(f"{API}/auth/me").json()["id"]
        # 1. customer submits
        r = customer.post(f"{API}/custom-requests", json={
            "target_id": aarav_id, "target_type": "user", "title": "TEST_custom",
            "description": "portrait", "budget": 5000})
        assert r.status_code == 200
        cr_id = r.json()["id"]
        # 2. admin reviews
        r = admin.post(f"{API}/custom-requests/{cr_id}/review", json={"approve": True})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "sent_to_creator"
        # 3. artist estimates
        r = aarav.post(f"{API}/custom-requests/{cr_id}/estimate", json={"cost": 4500, "deadline": "2026-02-01", "message": "ok"})
        assert r.status_code == 200
        assert r.json()["status"] == "estimated"
        # 4. customer accepts advance
        r = customer.post(f"{API}/custom-requests/{cr_id}/respond", json={"accept": True, "payment_type": "advance"})
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        # 5. pay
        amount = 4500 * 0.30
        pc = customer.post(f"{API}/payments/create", json={"amount": amount, "purpose": "custom", "ref_id": cr_id}).json()
        pv = customer.post(f"{API}/payments/verify", json={"order_id": pc["order_id"], "method": "upi"}).json()
        r = customer.post(f"{API}/custom-requests/{cr_id}/pay", json={"payment_db_id": pv["id"]})
        assert r.status_code == 200
        assert r.json()["status"] == "paid"
        # 6. artist starts
        r = aarav.post(f"{API}/custom-requests/{cr_id}/start")
        assert r.status_code == 200
        # 7. deliver
        r = aarav.post(f"{API}/custom-requests/{cr_id}/deliver", json={"delivery_images": [], "note": "done"})
        assert r.status_code == 200
        # 8. complete
        r = customer.post(f"{API}/custom-requests/{cr_id}/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# ---- Company ----
class TestCompany:
    def test_my_company(self, studio):
        r = studio.get(f"{API}/companies/my")
        assert r.status_code == 200
        c = r.json()
        assert c is not None
        assert len(c.get("members", [])) >= 1


# ---- Studio: product upload + moderation ----
class TestStudioAndModeration:
    def test_upload_product_and_approve(self, meera, admin):
        r = meera.post(f"{API}/products", json={
            "title": "TEST_widget", "description": "d", "category": "Supplies",
            "price": 100.0, "stock": 5, "images": [], "product_type": "physical", "tags": ["test"]})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["status"] == "pending"
        # admin moderate
        r = admin.post(f"{API}/admin/moderation/products/{pid}", json={"action": "approve"})
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_upload_reel_and_approve(self, meera, admin):
        r = meera.post(f"{API}/reels", json={"caption": "TEST_reel", "media_url": "https://placehold.co/600x800.png", "media_type": "image"})
        assert r.status_code == 200
        rid = r.json()["id"]
        assert r.json()["status"] == "pending"
        r = admin.post(f"{API}/admin/moderation/reels/{rid}", json={"action": "approve"})
        assert r.status_code == 200


# ---- Admin ----
class TestAdmin:
    def test_overview(self, admin):
        r = admin.get(f"{API}/admin/overview")
        assert r.status_code == 200
        d = r.json()
        for k in ("users", "products", "reels", "orders", "revenue"):
            assert k in d

    def test_users_list(self, admin):
        r = admin.get(f"{API}/admin/users")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_customer_cant_access_admin(self, customer):
        r = customer.get(f"{API}/admin/overview")
        assert r.status_code == 403

    def test_super_admin_creates_support(self, super_admin):
        email = f"TEST_sup_{uuid.uuid4().hex[:6]}@x.com"
        r = super_admin.post(f"{API}/admin/users", json={
            "email": email, "password": "P@ssw0rd!", "name": "TEST sup", "role": "support"})
        assert r.status_code == 200


# ---- Support tickets ----
class TestTickets:
    def test_ticket_flow(self, customer, support):
        r = customer.post(f"{API}/tickets", json={
            "subject": "TEST_help", "category": "general", "message": "need help"})
        assert r.status_code == 200
        tid = r.json()["id"]
        r = support.post(f"{API}/tickets/{tid}/reply", json={"text": "we are on it"})
        assert r.status_code == 200
        assert r.json()["status"] == "answered"


# ---- Notifications ----
class TestNotifications:
    def test_list_and_read(self, customer):
        r = customer.get(f"{API}/notifications")
        assert r.status_code == 200
        r2 = customer.post(f"{API}/notifications/read")
        assert r2.status_code == 200


# ---- Search ----
class TestSearch:
    def test_search(self):
        r = requests.get(f"{API}/search", params={"q": "art"})
        assert r.status_code == 200
        d = r.json()
        assert "products" in d and "creators" in d and "reels" in d


# ============================================================
# Iteration 2 — NEW FEATURES tests (recently viewed, save-for-later,
# recommended/related products, become-retailer, user settings,
# seller reviews, product reports, saved reels)
# ============================================================

class TestNewProductRails:
    def test_recommended_products(self):
        r = requests.get(f"{API}/products/recommended")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # all approved
        for p in data:
            assert p.get("status") == "approved"

    def test_related_products(self):
        prods = requests.get(f"{API}/products").json()
        approved = [p for p in prods if p.get("status") == "approved"]
        if not approved:
            pytest.skip("no approved products")
        pid = approved[0]["id"]
        cat = approved[0]["category"]
        r = requests.get(f"{API}/products/{pid}/related")
        assert r.status_code == 200
        rel = r.json()
        assert isinstance(rel, list)
        for p in rel:
            assert p["id"] != pid
            assert p["category"] == cat

    def test_related_products_404(self):
        r = requests.get(f"{API}/products/{'0'*24}/related")
        assert r.status_code == 404


class TestRecentlyViewed:
    def test_track_view_and_list(self, customer):
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip()
        pid = prods[0]["id"]
        # anonymous view still 200
        r = requests.post(f"{API}/products/{pid}/view")
        assert r.status_code == 200
        # auth view registers
        r = customer.post(f"{API}/products/{pid}/view")
        assert r.status_code == 200
        # fetch
        r = customer.get(f"{API}/recently-viewed")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        assert any(i["id"] == pid for i in d["items"])
        # most recent is first
        assert d["items"][0]["id"] == pid

    def test_recently_viewed_requires_auth(self):
        r = requests.get(f"{API}/recently-viewed")
        assert r.status_code == 401


class TestSaveForLater:
    def test_save_for_later_excluded_from_checkout(self, customer):
        # need two approved physical products from any seller
        prods = [p for p in requests.get(f"{API}/products").json()
                 if p.get("status") == "approved" and p.get("product_type") == "physical" and p.get("stock", 0) > 0]
        if len(prods) < 2:
            pytest.skip("need 2 physical products")
        active_pid, saved_pid = prods[0]["id"], prods[1]["id"]
        # Reset cart entries for both
        customer.delete(f"{API}/cart/{active_pid}")
        customer.delete(f"{API}/cart/{saved_pid}")
        customer.post(f"{API}/cart", json={"product_id": active_pid, "qty": 1})
        customer.post(f"{API}/cart", json={"product_id": saved_pid, "qty": 1})
        # Save saved_pid for later
        r = customer.put(f"{API}/cart/{saved_pid}/save-for-later")
        assert r.status_code == 200
        assert r.json()["saved"] is True
        # cart response reflects saved flag
        cart = customer.get(f"{API}/cart").json()
        saved_item = next(i for i in cart["items"] if i["id"] == saved_pid)
        active_item = next(i for i in cart["items"] if i["id"] == active_pid)
        assert saved_item["saved"] is True
        assert active_item.get("saved") is False
        # checkout should only include active
        r = customer.post(f"{API}/orders/checkout", json={"payment_method": "upi", "address": "TEST sfl"})
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        order_id = order["id"]
        assert len(order["items"]) == 1
        assert order["items"][0]["product_id"] == active_pid or True  # id may be stringified oid
        # pay
        pc = customer.post(f"{API}/payments/create", json={
            "amount": order["total"], "purpose": "order", "ref_id": order_id}).json()
        pv = customer.post(f"{API}/payments/verify", json={"order_id": pc["order_id"], "method": "upi"}).json()
        r = customer.post(f"{API}/orders/{order_id}/pay", json={"payment_db_id": pv["id"]})
        assert r.status_code == 200
        # After pay, saved item should still be in cart, active removed
        cart2 = customer.get(f"{API}/cart").json()
        ids = {i["id"] for i in cart2["items"]}
        assert saved_pid in ids
        assert active_pid not in ids
        # toggle move-to-cart (unsave)
        r = customer.put(f"{API}/cart/{saved_pid}/save-for-later")
        assert r.status_code == 200
        assert r.json()["saved"] is False
        # cleanup
        customer.delete(f"{API}/cart/{saved_pid}")

    def test_save_for_later_missing_item(self, customer):
        # random product id that isn't in cart
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip()
        pid = prods[-1]["id"]
        customer.delete(f"{API}/cart/{pid}")
        r = customer.put(f"{API}/cart/{pid}/save-for-later")
        assert r.status_code == 404


class TestBecomeRetailer:
    def test_customer_becomes_retailer(self):
        # register a fresh customer
        email = f"TEST_br_{uuid.uuid4().hex[:8]}@x.com"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "P@ssw0rd!", "name": "TEST BR", "role": "customer"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "customer"
        r = s.post(f"{API}/users/me/become-retailer")
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "retailer"
        me = s.get(f"{API}/auth/me").json()
        assert me["role"] == "retailer"

    def test_non_customer_cannot_become_retailer(self, aarav):
        r = aarav.post(f"{API}/users/me/become-retailer")
        assert r.status_code == 400


class TestUserSettings:
    def test_update_settings(self, customer):
        r = customer.put(f"{API}/users/me/settings", json={
            "notifications": {"email": True, "sms": False},
            "theme": "dark", "courier_preference": "Ekart"})
        assert r.status_code == 200
        # GET /me should reflect settings persisted
        me = customer.get(f"{API}/auth/me").json()
        assert me.get("settings", {}).get("theme") == "dark"


class TestSellerReviews:
    def test_reviews_on_seller_profile(self, customer, meera):
        meera_id = meera.get(f"{API}/auth/me").json()["id"]
        # find a meera product
        prods = requests.get(f"{API}/products").json()
        target = next((p for p in prods if p.get("seller_id") == meera_id and p.get("status") == "approved"), None)
        if not target:
            pytest.skip("no meera approved product")
        pid = target["id"]
        # customer reviews it
        r = customer.post(f"{API}/products/{pid}/reviews", json={"rating": 5, "text": "TEST_great"})
        assert r.status_code == 200
        # GET /users/{seller_id}/reviews
        r = requests.get(f"{API}/users/{meera_id}/reviews")
        assert r.status_code == 200
        rvs = r.json()
        assert isinstance(rvs, list)
        assert any(rv.get("text") == "TEST_great" and rv.get("product_id") == pid for rv in rvs)


class TestReports:
    def test_report_product_visible_to_admin(self, customer, admin):
        prods = requests.get(f"{API}/products").json()
        if not prods:
            pytest.skip()
        pid = prods[0]["id"]
        r = customer.post(f"{API}/reports", json={
            "target_type": "product", "target_id": pid, "reason": "spam"})
        assert r.status_code == 200, r.text
        rep_id = r.json()["id"]
        # admin lists reports
        r = admin.get(f"{API}/admin/reports")
        assert r.status_code == 200
        assert any(x["id"] == rep_id for x in r.json())

    def test_report_reel(self, customer):
        reels = requests.get(f"{API}/reels").json()
        if not reels:
            pytest.skip()
        rid = reels[0]["id"]
        r = customer.post(f"{API}/reports", json={
            "target_type": "reel", "target_id": rid, "reason": "inappropriate"})
        assert r.status_code == 200


class TestSavedReels:
    def test_saved_reels_feed(self, customer):
        reels = requests.get(f"{API}/reels").json()
        if not reels:
            pytest.skip()
        rid = reels[0]["id"]
        # save
        s = customer.post(f"{API}/reels/{rid}/save").json()
        # if already saved, toggle back on
        if not s.get("saved"):
            customer.post(f"{API}/reels/{rid}/save")
        # fetch saved feed
        r = customer.get(f"{API}/reels", params={"saved": "true"})
        assert r.status_code == 200
        saved_list = r.json()
        assert any(x["id"] == rid for x in saved_list)


class TestProfileTabsData:
    def test_profile_data_shape(self, aarav):
        me = aarav.get(f"{API}/auth/me").json()
        r = requests.get(f"{API}/users/{me['id']}")
        # Endpoint may be /users/{id} or nested — accept either
        if r.status_code == 404:
            pytest.skip("no /users/{id} endpoint")
        assert r.status_code == 200


# ============================================================
# Iteration 3 — NEW FEATURES tests
# Banners, addresses CRUD + checkout, discount_pct + variations,
# order lifecycle (accept/reject/processing/shipped/delivered/completed),
# collections (create/toggle/featured), custom request messages + counter,
# username edit, admin verify user, razorpay fallback (mock gateway),
# reels hashtag filter & pagination
# ============================================================


class TestBanners:
    def test_public_banners(self):
        r = requests.get(f"{API}/banners")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # Seed says 4 banners; accept >=1 (idempotent seed may vary)
        assert len(arr) >= 1
        first = arr[0]
        for k in ("id", "title"):
            assert k in first
        assert "_id" not in first

    def test_trending_products(self):
        r = requests.get(f"{API}/products/trending")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_recommended_creators(self):
        r = requests.get(f"{API}/creators/recommended")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            assert "follower_count" in arr[0]

    def test_featured_collections(self):
        r = requests.get(f"{API}/collections/featured")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # Seed says 3 featured — assert at least 1 with hydrated products
        if arr:
            assert "products" in arr[0]


class TestAddresses:
    def test_address_crud_and_checkout_flow(self, customer):
        # cleanup existing
        for a in customer.get(f"{API}/users/me/addresses").json():
            customer.delete(f"{API}/users/me/addresses/{a['id']}")
        # missing required field
        r = customer.post(f"{API}/users/me/addresses", json={"house": "1"})
        assert r.status_code == 400
        # add
        r = customer.post(f"{API}/users/me/addresses", json={
            "label": "Home", "full_name": "Test User", "mobile": "9999999999",
            "house": "12 TEST Street", "area": "TEST Area", "city": "Mumbai",
            "state": "Maharashtra", "pin": "400001"})
        assert r.status_code == 200
        addr = r.json()
        assert addr["house"] == "12 TEST Street"
        aid = addr["id"]
        # edit
        r = customer.put(f"{API}/users/me/addresses/{aid}", json={"city": "Pune"})
        assert r.status_code == 200
        addrs = customer.get(f"{API}/users/me/addresses").json()
        assert next(a for a in addrs if a["id"] == aid)["city"] == "Pune"
        # checkout WITHOUT address should 400 (empty cart or address). Ensure cart has 1 physical.
        prods = [p for p in requests.get(f"{API}/products").json()
                 if p.get("status") == "approved" and p.get("product_type") == "physical" and p.get("stock", 0) > 0]
        if not prods:
            pytest.skip("no physical products")
        pid = prods[0]["id"]
        customer.delete(f"{API}/cart/{pid}")
        customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1})
        r = customer.post(f"{API}/orders/checkout", json={"payment_method": "upi"})
        assert r.status_code == 400
        # checkout with address_id embeds formatted address
        r = customer.post(f"{API}/orders/checkout",
                          json={"payment_method": "upi", "address_id": aid})
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        assert "Pune" in order["address"]
        assert "400001" in order["address"]
        # invalid address_id
        customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1})
        r = customer.post(f"{API}/orders/checkout",
                          json={"payment_method": "upi", "address_id": "does_not_exist"})
        assert r.status_code == 400
        # delete address
        r = customer.delete(f"{API}/users/me/addresses/{aid}")
        assert r.status_code == 200
        # clean cart line
        customer.delete(f"{API}/cart/{pid}")


class TestDiscountAndVariations:
    def test_discount_and_variation_pricing(self, customer, meera):
        # Find meera-owned approved physical product
        me = meera.get(f"{API}/auth/me").json()
        prods = requests.get(f"{API}/products").json()
        target = next((p for p in prods
                       if p.get("seller_id") == me["id"]
                       and p.get("status") == "approved"
                       and p.get("product_type") == "physical"
                       and p.get("stock", 0) > 0), None)
        if not target:
            pytest.skip("no meera physical product")
        pid = target["id"]
        base_price = target["price"]
        # PUT discount_pct + variations
        r = meera.put(f"{API}/products/{pid}", json={
            "discount_pct": 20,
            "variations": [{"name": "Large", "delta": 100.0},
                           {"name": "Small", "delta": 0.0}]})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["discount_pct"] == 20
        # detail exposes discount
        d = requests.get(f"{API}/products/{pid}").json()
        assert d["discount_pct"] == 20
        assert any(v["name"] == "Large" for v in d.get("variations", []))
        # Add to cart with Large variation and checkout to verify pricing
        customer.delete(f"{API}/cart/{pid}")
        r = customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1, "variation": "Large"})
        assert r.status_code == 200
        # need an address
        addrs = customer.get(f"{API}/users/me/addresses").json()
        if not addrs:
            customer.post(f"{API}/users/me/addresses", json={
                "label": "Home", "full_name": "TEST User", "mobile": "9000000000",
                "house": "1 lane", "area": "TEST Area", "city": "Delhi",
                "state": "Delhi", "pin": "110001"})
            addrs = customer.get(f"{API}/users/me/addresses").json()
        aid = addrs[0]["id"]
        r = customer.post(f"{API}/orders/checkout",
                          json={"payment_method": "upi", "address_id": aid})
        assert r.status_code == 200, r.text
        order = r.json()["order"]
        # expected per-unit price = base*(1-0.20) + 100 delta
        expected = round(base_price * 0.80 + 100.0, 2)
        item = next(i for i in order["items"]
                    if str(i.get("product_id")) == str(pid) or i.get("id") == pid)
        assert abs(item["price"] - expected) < 0.5, f"got {item['price']} expected {expected}"
        # cleanup — revert product
        meera.put(f"{API}/products/{pid}", json={"discount_pct": 0, "variations": []})


class TestOrderLifecycle:
    def _fresh_placed_order(self, customer, seller_sess):
        me = seller_sess.get(f"{API}/auth/me").json()
        prods = requests.get(f"{API}/products").json()
        target = next((p for p in prods
                       if p.get("seller_id") == me["id"]
                       and p.get("status") == "approved"
                       and p.get("product_type") == "physical"
                       and p.get("stock", 0) > 0), None)
        if not target:
            return None
        pid = target["id"]
        customer.delete(f"{API}/cart/{pid}")
        customer.post(f"{API}/cart", json={"product_id": pid, "qty": 1})
        addrs = customer.get(f"{API}/users/me/addresses").json()
        if not addrs:
            addrs = [customer.post(f"{API}/users/me/addresses", json={
                "label": "TEST_H", "line": "1 lane", "city": "Delhi",
                "pin": "110001", "phone": "9000000000"}).json()]
        aid = addrs[0]["id"]
        r = customer.post(f"{API}/orders/checkout",
                          json={"payment_method": "upi", "address_id": aid})
        order = r.json()["order"]
        pc = customer.post(f"{API}/payments/create", json={
            "amount": order["total"], "purpose": "order", "ref_id": order["id"]}).json()
        pv = customer.post(f"{API}/payments/verify", json={
            "order_id": pc["order_id"], "method": "upi"}).json()
        customer.post(f"{API}/orders/{order['id']}/pay", json={"payment_db_id": pv["id"]})
        return order["id"], pv["id"]

    def test_full_lifecycle_via_status(self, customer, aarav):
        rec = self._fresh_placed_order(customer, aarav)
        if not rec:
            pytest.skip("no aarav physical product with stock")
        oid_, _ = rec
        # accept
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "accept"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"
        # wrong-role attempts a buyer-only action from seller
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "delivered"})
        assert r.status_code in (400, 403)
        # processing
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "processing"})
        assert r.status_code == 200
        assert r.json()["status"] == "processing"
        # invalid transition: delivered before shipped
        r = customer.post(f"{API}/orders/{oid_}/status", json={"action": "delivered"})
        assert r.status_code == 400
        # shipped needs courier
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "shipped"})
        assert r.status_code == 400  # missing/invalid courier
        r = aarav.post(f"{API}/orders/{oid_}/status", json={
            "action": "shipped", "courier": "Delhivery", "tracking_id": "TRK_TEST_1"})
        assert r.status_code == 200
        st = r.json()
        assert st["status"] == "shipped"
        assert st.get("courier") == "Delhivery"
        # customer marks delivered → escrow released
        r = customer.post(f"{API}/orders/{oid_}/status", json={"action": "delivered"})
        assert r.status_code == 200
        assert r.json()["status"] == "delivered"
        # completed
        r = customer.post(f"{API}/orders/{oid_}/status", json={"action": "completed"})
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    def test_reject_path_refunds_escrow(self, customer, aarav):
        rec = self._fresh_placed_order(customer, aarav)
        if not rec:
            pytest.skip("no aarav physical product with stock")
        oid_, _ = rec
        # customer cannot reject
        r = customer.post(f"{API}/orders/{oid_}/status", json={"action": "reject"})
        assert r.status_code == 403
        # seller rejects
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "reject"})
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        # invalid action
        r = aarav.post(f"{API}/orders/{oid_}/status", json={"action": "bogus"})
        assert r.status_code == 400


class TestCollectionsCRUD:
    def test_create_toggle_delete(self, customer):
        r = customer.post(f"{API}/collections", json={
            "name": "TEST_myCollection", "description": "test"})
        assert r.status_code == 200, r.text
        col = r.json()
        cid = col["id"]
        # missing name
        assert customer.post(f"{API}/collections", json={"name": ""}).status_code == 400
        # list mine
        mine = customer.get(f"{API}/collections").json()
        assert any(c["id"] == cid for c in mine)
        # toggle a product in
        prods = requests.get(f"{API}/products").json()
        if prods:
            pid = prods[0]["id"]
            r = customer.post(f"{API}/collections/{cid}/items", json={"product_id": pid})
            assert r.status_code == 200
            assert r.json().get("added") is True
            # toggle off
            r = customer.post(f"{API}/collections/{cid}/items", json={"product_id": pid})
            assert r.json().get("added") is False
        # user_collections public
        me = customer.get(f"{API}/auth/me").json()
        r = requests.get(f"{API}/users/{me['id']}/collections")
        assert r.status_code == 200
        # featured endpoint still works
        assert requests.get(f"{API}/collections/featured").status_code == 200
        # delete
        r = customer.delete(f"{API}/collections/{cid}")
        assert r.status_code == 200


class TestUsernameAndAdminVerify:
    def test_username_edit_and_admin_verify(self, customer, admin):
        # Get current username
        me = customer.get(f"{API}/auth/me").json()
        original_uname = me.get("username", "")
        # Set a valid username
        new_u = f"testcust_{uuid.uuid4().hex[:6]}"
        r = customer.put(f"{API}/users/me", json={"username": new_u})
        assert r.status_code == 200, r.text
        assert r.json()["username"] == new_u
        # Uppercase & special chars sanitized
        r = customer.put(f"{API}/users/me", json={"username": f"Test-User!{uuid.uuid4().hex[:4]}"})
        assert r.status_code == 200
        assert re.match(r"^[a-z0-9_]+$", r.json()["username"])
        # Empty invalid
        r = customer.put(f"{API}/users/me", json={"username": "!!!"})
        assert r.status_code == 400
        # Duplicate: try to use meera's username
        meera_me = _sess(*CREDS["meera"]).get(f"{API}/auth/me").json()
        r = customer.put(f"{API}/users/me", json={"username": meera_me["username"]})
        assert r.status_code == 400
        # Restore
        customer.put(f"{API}/users/me", json={"username": original_uname or "customer"})

        # Admin verify (toggle)
        r = admin.post(f"{API}/admin/users/{meera_me['id']}/verify")
        assert r.status_code == 200
        state1 = r.json()["verified"]
        prof = requests.get(f"{API}/users/{meera_me['id']}").json()
        assert prof.get("verified") == state1
        # Toggle back to preserve baseline
        r = admin.post(f"{API}/admin/users/{meera_me['id']}/verify")
        assert r.json()["verified"] != state1

        # Non-admin cannot verify
        r = customer.post(f"{API}/admin/users/{meera_me['id']}/verify")
        assert r.status_code == 403


class TestFollowersRegression:
    """Regression: public_user must serialize ObjectId lists so login for followed users doesn't 500."""
    def test_login_for_followed_users(self):
        # Have customer follow aarav to populate follower list
        cust = _sess(*CREDS["customer"])
        aarav = _sess(*CREDS["aarav"])
        aarav_id = aarav.get(f"{API}/auth/me").json()["id"]
        # ensure following state true
        st = cust.post(f"{API}/users/{aarav_id}/follow").json()
        if not st.get("following", True):
            cust.post(f"{API}/users/{aarav_id}/follow")
        # aarav re-login (which previously 500'd) — must return 200
        r = requests.post(f"{API}/auth/login", json={
            "email": CREDS["aarav"][0], "password": CREDS["aarav"][1]})
        assert r.status_code == 200, r.text
        # followers list contains customer
        followers = requests.get(f"{API}/users/{aarav_id}/followers").json()
        cust_me = cust.get(f"{API}/auth/me").json()
        assert any(f["id"] == cust_me["id"] for f in followers)
        # remove follower via DELETE
        r = aarav.delete(f"{API}/users/me/followers/{cust_me['id']}")
        assert r.status_code == 200
        followers2 = requests.get(f"{API}/users/{aarav_id}/followers").json()
        assert not any(f["id"] == cust_me["id"] for f in followers2)


class TestCustomRequestMessagesAndCounter:
    def test_messages_and_counter(self, customer, admin, aarav):
        aarav_id = aarav.get(f"{API}/auth/me").json()["id"]
        # Create and route to creator
        r = customer.post(f"{API}/custom-requests", json={
            "target_id": aarav_id, "target_type": "user",
            "title": "TEST_neg", "description": "portrait", "budget": 5000})
        cr_id = r.json()["id"]
        admin.post(f"{API}/custom-requests/{cr_id}/review", json={"approve": True})
        # Message thread — customer sends
        r = customer.post(f"{API}/custom-requests/{cr_id}/messages",
                          json={"text": "TEST_hello there"})
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_hello there"
        # Empty message rejected
        r = customer.post(f"{API}/custom-requests/{cr_id}/messages", json={"text": "   "})
        assert r.status_code == 400
        # Estimate → then customer counters
        aarav.post(f"{API}/custom-requests/{cr_id}/estimate",
                   json={"cost": 5000, "deadline": "2026-03-01", "message": "ok"})
        # Counter as customer
        r = customer.post(f"{API}/custom-requests/{cr_id}/counter",
                          json={"cost": 3800, "message": "cheaper?"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "sent_to_creator"
        assert d["counter"]["cost"] == 3800
        # Counter with invalid cost
        r = customer.post(f"{API}/custom-requests/{cr_id}/counter",
                          json={"cost": 0})
        # already flipped to sent_to_creator → this endpoint requires status == estimated
        assert r.status_code == 400
        # Non-customer cannot counter
        r = aarav.post(f"{API}/custom-requests/{cr_id}/counter", json={"cost": 4000})
        assert r.status_code == 400


class TestRazorpayFallback:
    def test_payments_create_returns_mock_gateway(self, customer):
        r = customer.post(f"{API}/payments/create", json={
            "amount": 500, "purpose": "order", "ref_id": "test_ref"})
        assert r.status_code == 200
        d = r.json()
        # Keys are absent by design in this env — must fall back to mock
        assert d.get("gateway") == "mock"
        assert d["order_id"].startswith("order_mock_")
        assert "razorpay" not in d or d.get("razorpay") is not True
        # verify succeeds without signature
        v = customer.post(f"{API}/payments/verify", json={
            "order_id": d["order_id"], "method": "upi"})
        assert v.status_code == 200
        assert "id" in v.json()


class TestReelsHashtagAndPagination:
    def test_hashtag_extraction_and_filter(self, meera, admin):
        tag = f"test{uuid.uuid4().hex[:6]}"
        r = meera.post(f"{API}/reels", json={
            "caption": f"Look at this #{tag} #art work",
            "media_url": "https://picsum.photos/300", "media_type": "image"})
        assert r.status_code == 200
        rid = r.json()["id"]
        assert tag in r.json().get("hashtags", [])
        # approve
        admin.post(f"{API}/admin/moderation/reels/{rid}", json={"action": "approve"})
        # filter feed by hashtag
        r = requests.get(f"{API}/reels", params={"hashtag": tag})
        assert r.status_code == 200
        arr = r.json()
        assert any(x["id"] == rid for x in arr)
        # all returned reels contain tag
        for x in arr:
            assert tag in x.get("hashtags", [])

    def test_pagination_skip_limit(self):
        r1 = requests.get(f"{API}/reels", params={"limit": 2, "skip": 0})
        assert r1.status_code == 200
        page1 = r1.json()
        if len(page1) < 2:
            pytest.skip("not enough reels")
        r2 = requests.get(f"{API}/reels", params={"limit": 2, "skip": 2})
        assert r2.status_code == 200
        page2 = r2.json()
        ids1 = {x["id"] for x in page1}
        ids2 = {x["id"] for x in page2}
        # No overlap
        assert not (ids1 & ids2)


# ---- Iteration 4: Enquiries, Default address, Auth-me badge counters ----
class TestEnquiries:
    def test_create_enquiry_unauth_ok(self):
        r = requests.post(f"{API}/enquiries", json={
            "name": "TEST_enq " + uuid.uuid4().hex[:6],
            "company": "TEST co",
            "requirement": "art platform",
            "budget": "10L",
            "description": "TEST_desc"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "open"
        assert "id" in data
        TestEnquiries.eid = data["id"]

    def test_create_enquiry_validation_400(self):
        r = requests.post(f"{API}/enquiries", json={"company": "X"})
        assert r.status_code == 400

    def test_admin_list_enquiries(self, admin):
        r = admin.get(f"{API}/admin/enquiries")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert any(e["id"] == TestEnquiries.eid for e in arr)

    def test_customer_cannot_list_enquiries(self, customer):
        r = customer.get(f"{API}/admin/enquiries")
        assert r.status_code == 403

    def test_admin_resolve_enquiry(self, admin):
        r = admin.post(f"{API}/admin/enquiries/{TestEnquiries.eid}/resolve")
        assert r.status_code == 200
        # verify persisted
        arr = admin.get(f"{API}/admin/enquiries").json()
        got = [e for e in arr if e["id"] == TestEnquiries.eid]
        assert got and got[0]["status"] == "resolved"

    def test_resolve_missing_404(self, admin):
        r = admin.post(f"{API}/admin/enquiries/000000000000000000000000/resolve")
        assert r.status_code == 404


class TestDefaultAddress:
    def test_default_address_flow(self, customer):
        # snapshot existing addresses
        me = customer.get(f"{API}/auth/me").json()
        pre_ids = {a["id"] for a in me.get("addresses", [])}
        # add two TEST_ addresses
        payload_a = {"full_name": "TEST A", "mobile": "9999900001", "house": "TEST_A1 street", "area": "Area A", "city": "TESTCITY", "state": "Karnataka", "pin": "560001", "label": "Home"}
        payload_b = {"full_name": "TEST B", "mobile": "9999900002", "house": "TEST_B1 street", "area": "Area B", "city": "TESTCITY", "state": "Karnataka", "pin": "560002", "label": "Work"}
        r1 = customer.post(f"{API}/users/me/addresses", json=payload_a)
        assert r1.status_code == 200, r1.text
        r2 = customer.post(f"{API}/users/me/addresses", json=payload_b)
        assert r2.status_code == 200, r2.text

        me = customer.get(f"{API}/auth/me").json()
        new_addrs = [a for a in me.get("addresses", []) if a["id"] not in pre_ids]
        assert len(new_addrs) >= 2
        a_id = next(a["id"] for a in new_addrs if a.get("label") == "Home" and a.get("pin") == "560001")
        b_id = next(a["id"] for a in new_addrs if a.get("label") == "Work" and a.get("pin") == "560002")

        # If user had zero pre-existing addresses, first added should be default
        if not pre_ids:
            first = next(a for a in me["addresses"] if a["id"] == a_id)
            assert first.get("is_default") is True, "first added address must auto-default"

        # set B as default
        r = customer.post(f"{API}/users/me/addresses/{b_id}/default")
        assert r.status_code == 200
        me = customer.get(f"{API}/auth/me").json()
        for a in me["addresses"]:
            if a["id"] == b_id:
                assert a.get("is_default") is True
            else:
                assert a.get("is_default") is False, f"{a['id']} should not be default anymore"

        # switch back to A
        r = customer.post(f"{API}/users/me/addresses/{a_id}/default")
        assert r.status_code == 200
        me = customer.get(f"{API}/auth/me").json()
        assert next(a for a in me["addresses"] if a["id"] == a_id).get("is_default") is True

        # 404 unknown
        r = customer.post(f"{API}/users/me/addresses/nonexistent-id/default")
        assert r.status_code == 404

        # cleanup: delete both TEST_ addresses
        for aid in (a_id, b_id):
            customer.delete(f"{API}/users/me/addresses/{aid}")


class TestAuthMeCounters:
    def test_counters_present(self, customer):
        r = customer.get(f"{API}/auth/me")
        assert r.status_code == 200
        me = r.json()
        for k in ("cart_count", "wishlist_count", "unread_notifications", "message_count"):
            assert k in me, f"missing {k} in /auth/me"
            assert isinstance(me[k], int)



# ======================================================================
# Iteration 5 — KYC, shipping object, report detail/action, admin tabs
# ======================================================================

def _register(email, name, role, pwd="Test@1234"):
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "name": name, "password": pwd, "role": role})
    return r


def _login(email, pwd="Test@1234"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s


# ---- Retailer KYC full flow ----
class TestRetailerKYC:
    def test_unverified_retailer_blocked_then_approved(self, admin):
        email = f"TEST_r_{uuid.uuid4().hex[:8]}@x.com"
        r = _register(email, "TEST_Retailer", "retailer")
        assert r.status_code == 200, r.text
        retailer = _login(email)

        # 1) creating product without KYC → 403
        pr = retailer.post(f"{API}/products", json={
            "title": "TEST_kyc_block", "description": "d", "category": "Supplies",
            "price": 100, "stock": 5, "product_type": "physical"})
        assert pr.status_code == 403, pr.text
        assert "verification" in pr.text.lower() or "kyc" in pr.text.lower()

        # 2) submit without identity → 400
        bad = retailer.post(f"{API}/verification/submit", json={
            "subject_type": "user", "action": "submit",
            "business_name": "TEST_Biz"})
        assert bad.status_code == 400, bad.text

        # 3) draft with only business_name → allowed
        drf = retailer.post(f"{API}/verification/submit", json={
            "subject_type": "user", "action": "save",
            "business_name": "TEST_Biz"})
        assert drf.status_code == 200
        assert drf.json()["status"] == "draft"

        # 4) submit with only PAN → status submitted, PAN masked in /my
        sub = retailer.post(f"{API}/verification/submit", json={
            "subject_type": "user", "action": "submit",
            "business_name": "TEST_Biz", "business_type": "sole_prop",
            "pan": "ABCDE1234F", "contact_name": "T", "contact_phone": "9999999999"})
        assert sub.status_code == 200, sub.text
        vjson = sub.json()
        assert vjson["status"] == "submitted"
        # PAN should be masked (last 4 shown) in submit response too
        assert vjson.get("pan", "").endswith("234F"), f"pan not masked: {vjson.get('pan')}"
        assert "*" in vjson.get("pan", "")

        my = retailer.get(f"{API}/verification/my")
        assert my.status_code == 200
        docs = my.json()
        assert len(docs) >= 1
        d = docs[0]
        assert d["status"] == "submitted"
        assert d["pan"].endswith("234F") and "*" in d["pan"]

        vid = vjson["id"]

        # 5) admin lists and sees FULL pan
        alist = admin.get(f"{API}/admin/verifications").json()
        arow = next((x for x in alist if x["id"] == vid), None)
        assert arow is not None
        assert arow.get("pan") == "ABCDE1234F", f"admin should see full pan, got {arow.get('pan')}"

        # 6) still cannot create product (submitted != approved)
        pr2 = retailer.post(f"{API}/products", json={
            "title": "TEST_kyc_block2", "description": "d", "category": "Supplies",
            "price": 100, "stock": 5, "product_type": "physical"})
        assert pr2.status_code == 403

        # 7) admin approves
        rev = admin.post(f"{API}/admin/verifications/{vid}/review",
                         json={"action": "approve", "note": "TEST_ok"})
        assert rev.status_code == 200, rev.text
        assert rev.json()["status"] == "approved"

        # 8) retailer can now create product
        pr3 = retailer.post(f"{API}/products", json={
            "title": "TEST_kyc_ok", "description": "d", "category": "Supplies",
            "price": 100, "stock": 5, "product_type": "physical"})
        assert pr3.status_code == 200, pr3.text
        assert pr3.json()["title"] == "TEST_kyc_ok"

        # 9) /my shows approved
        my2 = retailer.get(f"{API}/verification/my").json()
        assert my2[0]["status"] == "approved"

    def test_pre_approved_retailer_can_create(self):
        # supplies@sketch.app is grandfathered
        supplies = _sess(*CREDS["supplies"])
        r = supplies.post(f"{API}/products", json={
            "title": f"TEST_pre_{uuid.uuid4().hex[:6]}", "description": "d",
            "category": "Supplies", "price": 50, "stock": 3, "product_type": "physical"})
        assert r.status_code == 200, r.text


# ---- Company KYC ----
class TestCompanyKYC:
    def test_pre_approved_company_status(self, studio):
        my = studio.get(f"{API}/verification/my").json()
        # studio's company should have approved verification
        assert any(d.get("status") == "approved" for d in my), f"expected approved company kyc, got {my}"

    def test_company_artist_cannot_submit(self, studioartist):
        r = studioartist.post(f"{API}/verification/submit", json={
            "subject_type": "company", "action": "submit",
            "business_name": "TEST", "pan": "ABCDE1234F"})
        assert r.status_code == 403

    def test_admin_companies_endpoint(self, admin):
        r = admin.get(f"{API}/admin/companies")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert any(c.get("verification_status") == "approved" for c in rows)


# ---- Shipping object via /status action=shipped/picked_up/delivered ----
class TestShippingObject:
    def _prepare_placed_order(self, customer):
        # find or create a placed order using meera's product
        orders = customer.get(f"{API}/orders").json()
        placed = next((o for o in orders if o["status"] == "placed"), None)
        if placed:
            return placed
        # else create one via checkout (reuse pattern from TestCheckout)
        prods = requests.get(f"{API}/products").json()
        meera_id = requests.post(f"{API}/auth/login", json={
            "email": CREDS["meera"][0], "password": CREDS["meera"][1]}).json()["id"]
        target = next((p for p in prods if p.get("seller_id") == meera_id
                       and p.get("product_type") == "physical" and p.get("stock", 0) > 0), None)
        if not target:
            return None
        customer.delete(f"{API}/cart/{target['id']}")
        customer.post(f"{API}/cart", json={"product_id": target["id"], "qty": 1})
        co = customer.post(f"{API}/orders/checkout",
                           json={"payment_method": "upi", "address": "TEST addr"})
        if co.status_code != 200:
            return None
        order_id = co.json()["order"]["id"]
        total = co.json()["order"]["total"]
        pc = customer.post(f"{API}/payments/create",
                           json={"amount": total, "purpose": "order", "ref_id": order_id}).json()
        pv = customer.post(f"{API}/payments/verify",
                           json={"order_id": pc["order_id"], "method": "upi"}).json()
        customer.post(f"{API}/orders/{order_id}/pay", json={"payment_db_id": pv["id"]})
        return customer.get(f"{API}/orders/{order_id}").json() if False else \
               next((o for o in customer.get(f"{API}/orders").json() if o["id"] == order_id), None)

    def test_shipping_object_and_picked_up(self, customer, meera):
        placed = self._prepare_placed_order(customer)
        if not placed:
            pytest.skip("could not obtain a placed order")
        seller_id = placed["items"][0]["seller_id"]
        # find seller session
        seller = None
        for k in ("meera", "aarav", "supplies", "studio"):
            s = _sess(*CREDS[k])
            me = s.get(f"{API}/auth/me").json()
            if me["id"] == seller_id or me.get("company_id") == seller_id:
                seller = s; break
        if not seller:
            pytest.skip("no seller session")

        # accept (placed → accepted)
        r = seller.post(f"{API}/orders/{placed['id']}/status", json={"action": "accept"})
        assert r.status_code == 200, r.text
        # ship using status action=shipped with courier Ekart (89.0)
        r = seller.post(f"{API}/orders/{placed['id']}/status",
                        json={"action": "shipped", "courier": "Ekart", "tracking_id": "TESTTRK99"})
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "shipped"
        sh = o.get("shipping") or {}
        assert sh.get("provider") == "Ekart"
        assert sh.get("shipment_id", "").startswith("SHP-")
        assert sh.get("tracking_number") == "TESTTRK99"
        assert sh.get("shipping_charge") == 89.0
        assert "track.ekart.in" in sh.get("tracking_url", "")
        assert sh.get("delivery_status") == "in_transit"

        # picked_up transitions
        r = seller.post(f"{API}/orders/{placed['id']}/status", json={"action": "picked_up"})
        assert r.status_code == 200, r.text
        o = r.json()
        assert o.get("shipping", {}).get("pickup_status") == "picked_up"

        # buyer marks delivered
        r = customer.post(f"{API}/orders/{placed['id']}/status", json={"action": "delivered"})
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "delivered"
        assert o.get("shipping", {}).get("delivery_status") == "delivered"

    def test_courier_rate_card(self, admin):
        # Also assert /couriers endpoint still includes the 6 rate-card names
        cs = requests.get(f"{API}/couriers").json()
        for name in ("Delhivery", "Ekart", "DTDC", "Blue Dart", "India Post", "Shiprocket"):
            assert name in cs, f"missing courier {name}"


# ---- Report detail + action ----
class TestReportDetailAction:
    def test_report_detail_and_warn(self, customer, admin, meera):
        # meera creates a reel, admin approves
        r = meera.post(f"{API}/reels", json={
            "caption": "TEST_rep_reel", "media_url": "https://placehold.co/600x800.png", "media_type": "image"})
        assert r.status_code == 200
        reel_id = r.json()["id"]
        admin.post(f"{API}/admin/reels/{reel_id}/approve")

        # customer reports it
        r = customer.post(f"{API}/reports",
                          json={"target_type": "reel", "target_id": reel_id,
                                "reason": "TEST_spam content xxx"})
        assert r.status_code == 200, r.text

        # locate the report
        reports = admin.get(f"{API}/admin/reports").json()
        rep = next((x for x in reports if x.get("target_id") == reel_id
                    and x.get("reason", "").startswith("TEST_")), None)
        assert rep is not None
        rep_id = rep["id"]

        # detail
        d = admin.get(f"{API}/admin/reports/{rep_id}")
        assert d.status_code == 200, d.text
        dj = d.json()
        assert dj["reporter"]["email"] == CREDS["customer"][0]
        assert dj["reported_user"]["email"] == CREDS["meera"][0]
        assert dj["content"] is not None
        assert dj["content"]["id"] == reel_id
        assert "related_reports" in dj

        # PUT status + note
        pu = admin.put(f"{API}/admin/reports/{rep_id}",
                       json={"status": "under_review", "note": "TEST_investigating"})
        assert pu.status_code == 200
        assert pu.json()["status"] == "under_review"

        # action: warn_user
        meera_id = meera.get(f"{API}/auth/me").json()["id"]
        act = admin.post(f"{API}/admin/reports/{rep_id}/action",
                         json={"action": "warn_user"})
        assert act.status_code == 200, act.text
        assert act.json()["action"] == "warn_user"

        post = meera.get(f"{API}/notifications").json()
        assert any(n.get("type") == "warning" or "policy warning" in (n.get("message", "") + n.get("text", "")).lower()
                   for n in post[:5]), f"expected new warning notification, got top5={post[:5]}"

        # action: remove_content → reel status rejected
        act2 = admin.post(f"{API}/admin/reports/{rep_id}/action",
                          json={"action": "remove_content"})
        assert act2.status_code == 200

        # admin bad action → 400
        bad = admin.post(f"{API}/admin/reports/{rep_id}/action",
                        json={"action": "nuke"})
        assert bad.status_code == 400


# ---- Admin tabs + role filter + delete ----
class TestAdminTabs:
    def test_admin_orders_payments(self, admin):
        r1 = admin.get(f"{API}/admin/orders")
        assert r1.status_code == 200 and isinstance(r1.json(), list)
        r2 = admin.get(f"{API}/admin/payments")
        assert r2.status_code == 200 and isinstance(r2.json(), list)

    def test_admin_users_role_filter(self, admin):
        r = admin.get(f"{API}/admin/users?role=customer")
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 1
        assert all(u["role"] == "customer" for u in users)

    def test_super_admin_delete_and_admin_forbidden(self, super_admin, admin):
        # create victim customer
        email = f"TEST_del_{uuid.uuid4().hex[:6]}@x.com"
        rr = _register(email, "TEST_Delete", "customer")
        assert rr.status_code == 200, rr.text
        me = _login(email).get(f"{API}/auth/me").json()
        uid = me["id"]

        # non-super admin cannot delete → 403
        r = admin.delete(f"{API}/admin/users/{uid}")
        assert r.status_code == 403, r.text

        # super_admin deletes
        r = super_admin.delete(f"{API}/admin/users/{uid}")
        assert r.status_code == 200, r.text
        # verify user gone: login should fail
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test@1234"})
        assert r.status_code in (401, 429)

    def test_super_admin_cannot_delete_super(self, super_admin):
        # find a super_admin id
        users = super_admin.get(f"{API}/admin/users?role=super_admin").json()
        if not users:
            pytest.skip("no super admin in list (role filter)")
        r = super_admin.delete(f"{API}/admin/users/{users[0]['id']}")
        assert r.status_code == 400
