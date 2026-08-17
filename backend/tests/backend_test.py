"""End-to-end backend integration tests for Sketch platform.

Covers: auth (email/pwd, OTP, refresh), profiles, reels, products, cart/wishlist,
orders + mock payment escrow, custom-request full flow, company mgmt,
support tickets, notifications, admin moderation/overview, RBAC.
"""
import os
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
        r = meera.post(f"{API}/reels", json={"caption": "TEST_reel", "media_url": "http://x/img.png", "media_type": "image"})
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
