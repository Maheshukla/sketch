import logging
import re
from datetime import datetime, timezone

from bson import ObjectId

from auth import hash_password

logger = logging.getLogger(__name__)

IMG = {
    "abstract": "https://images.unsplash.com/photo-1785084288792-51e64dccb318?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMHBhaW50aW5nJTIwZ2FsbGVyeXxlbnwwfHx8fDE3ODY5OTQ4ODZ8MA&ixlib=rb-4.1.0&q=85",
    "paint2": "https://images.pexels.com/photos/1475390/pexels-photo-1475390.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "paint3": "https://images.pexels.com/photos/1546542/pexels-photo-1546542.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "digital1": "https://images.unsplash.com/photo-1729271170441-27c856c4922a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njl8MHwxfHNlYXJjaHwzfHxkaWdpdGFsJTIwM2QlMjBhcnQlMjBkZXNpZ258ZW58MHx8fHwxNzg2OTk0ODg3fDA&ixlib=rb-4.1.0&q=85",
    "digital2": "https://images.pexels.com/photos/29626041/pexels-photo-29626041.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "digital3": "https://images.pexels.com/photos/36025195/pexels-photo-36025195.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "clay1": "https://images.pexels.com/photos/19341648/pexels-photo-19341648.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "clay2": "https://images.pexels.com/photos/28486231/pexels-photo-28486231.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "studio1": "https://images.unsplash.com/photo-1614244139209-53c071a4737d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwzfHxhcnRpc3QlMjBzdHVkaW8lMjB3b3JraW5nfGVufDB8fHx8MTc4Njk5NDg4Nnww&ixlib=rb-4.1.0&q=85",
    "studio2": "https://images.pexels.com/photos/933255/pexels-photo-933255.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
}

CATEGORIES = [
    {"name": "Sketch", "subcategories": ["Pencil sketches", "Portraits", "Character sketches"]},
    {"name": "Painting", "subcategories": ["Watercolor", "Acrylic", "Oil painting"]},
    {"name": "Crafting", "subcategories": ["Handmade gifts", "Paper crafts", "Resin art", "Clay art"]},
    {"name": "Design", "subcategories": ["Illustrations", "Motion graphics", "UI/UX design", "Branding"]},
    {"name": "Animation", "subcategories": ["2D animation", "3D animation", "Motion graphics"]},
    {"name": "Digital Art", "subcategories": ["Digital painting", "3D art", "Pixel art"]},
    {"name": "Handmade", "subcategories": ["Jewelry", "Home decor", "Textiles"]},
    {"name": "Events", "subcategories": ["Birthday themes", "Festival themes"]},
    {"name": "Wedding", "subcategories": ["Invitations", "Decor themes", "Gift designs"]},
    {"name": "Gifts", "subcategories": ["Personalized gifts", "Gift hampers", "Gift designs"]},
    {"name": "Supplies", "subcategories": ["Paint", "Canvas", "Brushes", "Crafting tools", "Art paper", "Packaging materials"]},
    {"name": "Software", "subcategories": ["Design software", "Animation software", "Creative subscriptions"]},
    {"name": "Templates", "subcategories": ["Social media", "Print", "Branding kits", "Fonts", "Digital assets"]},
]


BANNERS = [
    {"title": "The Monsoon Edit", "subtitle": "Original watercolors and sketches from independent artists.",
     "image": IMG["paint2"], "cta_label": "Explore artwork", "cta_link": "/marketplace",
     "tag": "Seasonal collection", "order": 1, "active": True},
    {"title": "Commission a portrait", "subtitle": "Custom artwork, made for your story. Advance payments protected by escrow.",
     "image": IMG["studio2"], "cta_label": "Start a commission", "cta_link": "/reels",
     "tag": "Featured creators", "order": 2, "active": True},
    {"title": "Wedding season ateliers", "subtitle": "Invitations, decor themes and gift design from verified studios.",
     "image": IMG["digital3"], "cta_label": "Explore wedding services", "cta_link": "/marketplace?category=Wedding",
     "tag": "Wedding campaign", "order": 3, "active": True},
    {"title": "Studio supplies, restocked", "subtitle": "Brushes, canvas and cotton paper from trusted retailers.",
     "image": IMG["studio1"], "cta_label": "Shop supplies", "cta_link": "/marketplace?category=Supplies",
     "tag": "Marketplace", "order": 4, "active": True},
]


def _user(email, password, name, role, **extra):
    doc = {
        "email": email, "password_hash": hash_password(password), "name": name,
        "role": role, "status": "active", "followers": [], "following": [],
        "bio": "", "avatar": "", "banner": "", "specialty": "", "mobile": "",
        "courier_preference": "Delhivery", "created_at": datetime.now(timezone.utc),
    }
    doc.update(extra)
    return doc


async def seed(db):
    await db.users.create_index("email", unique=True)
    await db.otps.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    try:
        await db.login_attempts.create_index("locked_until", expireAfterSeconds=0)
    except Exception:
        pass
    await db.products.create_index([("title", "text"), ("description", "text"), ("tags", "text")])

    import os
    admin_email = os.environ["ADMIN_EMAIL"]
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(_user(admin_email, admin_pw, "Platform Owner", "super_admin"))
        logger.info("Seeded super admin")
    elif existing.get("role") != "super_admin":
        await db.users.update_one({"email": admin_email}, {"$set": {"role": "super_admin"}})

    for c in CATEGORIES:
        await db.categories.update_one(
            {"name": c["name"]},
            {"$set": {"subcategories": c["subcategories"]},
             "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True)

    async for u in db.users.find({"username": {"$exists": False}}):
        base = re.sub(r"[^a-z0-9]", "", (u.get("name") or "user").lower())[:12] or "user"
        username, n = base, 1
        while await db.users.find_one({"username": username}):
            n += 1
            username = f"{base}{n}"
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"username": username}})

    for b in BANNERS:
        await db.banners.update_one({"title": b["title"]}, {"$set": b}, upsert=True)

    if not await db.collections.count_documents({"featured": True}):
        admin_user = await db.users.find_one({"email": admin_email})
        if admin_user:
            picks = {
                "Editors' picks — Painting": ["Monsoon Reverie", "Abstract Geometry No.7", "Charcoal Portrait Study"],
                "Handmade & clay": ["Ceramic Moon Vase", "Terracotta Duo Planters"],
                "Digital drops": ["Neon Bloom — Digital Print", "Holographic Dream Loop", "3D Character Sculpt — Game Ready"],
            }
            for name, titles in picks.items():
                pids = [p["_id"] async for p in db.products.find({"title": {"$in": titles}})]
                if pids:
                    await db.collections.insert_one({
                        "user_id": admin_user["_id"], "name": name,
                        "description": "Curated by the Sketch editorial team",
                        "product_ids": pids, "featured": True,
                        "created_at": datetime.now(timezone.utc)})

    if await db.users.count_documents({}) > 1:
        return

    logger.info("Seeding demo data...")
    admin = _user("admin@sketch.app", "Admin@123", "Aditi Rao", "admin")
    support = _user("support@sketch.app", "Support@123", "Kabir Menon", "support")
    aarav = _user("aarav@sketch.app", "Artist@123", "Aarav Sharma", "artist",
                  bio="Portrait & character sketch artist. 8 years of graphite and charcoal.",
                  avatar=IMG["studio2"], specialty="Pencil sketches", mobile="9810010001")
    meera = _user("meera@sketch.app", "Artist@123", "Meera Iyer", "artist",
                  bio="Watercolor and clay. Chasing monsoon light.",
                  avatar=IMG["paint2"], specialty="Watercolor", mobile="9810010002")
    retailer = _user("supplies@sketch.app", "Retailer@123", "ArtKart Supplies", "retailer",
                     bio="Premium art supplies, paper, canvas and digital assets.",
                     avatar=IMG["studio1"], mobile="9810010003")
    owner = _user("studio@sketch.app", "Company@123", "Rohan Kapoor", "company_owner",
                  bio="Founder, Pixel & Pigment Studio.", avatar=IMG["digital1"], mobile="9810010004")
    comp_admin = _user("studioadmin@sketch.app", "Company@123", "Sana Qureshi", "company_admin", mobile="9810010005")
    comp_artist = _user("studioartist@sketch.app", "Company@123", "Dev Patel", "company_artist", mobile="9810010006")
    customer = _user("customer@sketch.app", "Customer@123", "Ananya Verma", "customer", mobile="9810010007")

    res = await db.users.insert_many([admin, support, aarav, meera, retailer, owner, comp_admin, comp_artist, customer])
    ids = dict(zip(["admin", "support", "aarav", "meera", "retailer", "owner", "comp_admin", "comp_artist", "customer"], res.inserted_ids))

    company_id = ObjectId()
    await db.companies.insert_one({
        "_id": company_id, "name": "Pixel & Pigment Studio",
        "description": "A full-service creative studio for illustration, motion graphics and event design.",
        "avatar": IMG["digital3"], "owner_id": ids["owner"],
        "members": [
            {"user_id": ids["owner"], "role": "owner", "name": "Rohan Kapoor", "email": "studio@sketch.app"},
            {"user_id": ids["comp_admin"], "role": "admin", "name": "Sana Qureshi", "email": "studioadmin@sketch.app"},
            {"user_id": ids["comp_artist"], "role": "artist", "name": "Dev Patel", "email": "studioartist@sketch.app"},
        ],
        "created_at": datetime.now(timezone.utc),
    })
    for uid in (ids["owner"], ids["comp_admin"], ids["comp_artist"]):
        await db.users.update_one({"_id": uid}, {"$set": {"company_id": company_id}})

    now = datetime.now(timezone.utc)
    products = [
        dict(title="Monsoon Reverie", description="Original watercolor on cold-pressed paper. 16x20 in, unframed.", category="Painting", subcategory="Watercolor", price=12500, stock=3, images=[IMG["paint2"], IMG["paint3"]], product_type="physical", seller_id=ids["meera"], seller_name="Meera Iyer", tags=["watercolor", "original", "monsoon"]),
        dict(title="Charcoal Portrait Study", description="Hand-drawn charcoal portrait, archival fixative applied. A3.", category="Sketch", subcategory="Portraits", price=4200, stock=5, images=[IMG["paint3"]], product_type="physical", seller_id=ids["aarav"], seller_name="Aarav Sharma", tags=["charcoal", "portrait"]),
        dict(title="Abstract Geometry No.7", description="Acrylic on gallery-wrapped canvas. 24x36 in, ready to hang.", category="Painting", subcategory="Acrylic", price=18000, stock=1, images=[IMG["abstract"]], product_type="physical", seller_id=ids["meera"], seller_name="Meera Iyer", tags=["abstract", "acrylic"]),
        dict(title="Neon Bloom — Digital Print", description="High-resolution digital illustration, 6000x6000px PNG + WEBP.", category="Design", subcategory="Illustrations", price=2999, stock=999, images=[IMG["digital1"]], product_type="digital", seller_id=ids["aarav"], seller_name="Aarav Sharma", tags=["digital", "illustration"]),
        dict(title="Ceramic Moon Vase", description="Hand-thrown stoneware vase, matte glaze. 10 in tall.", category="Crafting", subcategory="Clay art", price=3400, stock=6, images=[IMG["clay1"]], product_type="physical", seller_id=ids["meera"], seller_name="Meera Iyer", tags=["ceramic", "handmade"]),
        dict(title="Terracotta Duo Planters", description="Set of two hand-built terracotta planters.", category="Crafting", subcategory="Clay art", price=2800, stock=4, images=[IMG["clay2"]], product_type="physical", seller_id=ids["meera"], seller_name="Meera Iyer", tags=["terracotta", "planter"]),
        dict(title="Holographic Dream Loop", description="Seamless 4K motion graphics loop, MP4, commercial license.", category="Design", subcategory="Motion graphics", price=1499, stock=999, images=[IMG["digital2"]], product_type="digital", seller_id=ids["aarav"], seller_name="Aarav Sharma", tags=["motion", "4k", "loop"]),
        dict(title="Studio Portrait Commission", description="Custom pencil portrait from your photo. 2-week delivery.", category="Sketch", subcategory="Portraits", price=6500, stock=10, images=[IMG["studio2"]], product_type="physical", seller_id=ids["aarav"], seller_name="Aarav Sharma", tags=["commission", "portrait"]),
        dict(title="3D Character Sculpt — Game Ready", description="Stylized character model, OBJ + FBX, rigged.", category="Design", subcategory="Illustrations", price=9999, stock=999, images=[IMG["digital3"]], product_type="digital", seller_id=company_id, seller_name="Pixel & Pigment Studio", seller_type="company", tags=["3d", "character"]),
        dict(title="Pro Artist Brush Set (12 pc)", description="Synthetic sable brushes for watercolor and acrylic.", category="Supplies", subcategory="Brushes", price=1299, stock=50, images=[IMG["studio1"]], product_type="physical", seller_id=ids["retailer"], seller_name="ArtKart Supplies", tags=["brushes", "supplies"]),
        dict(title="Cold-Pressed Watercolor Paper A3", description="300gsm cotton rag, pack of 25 sheets.", category="Supplies", subcategory="Art paper", price=899, stock=120, images=[IMG["paint2"]], product_type="physical", seller_id=ids["retailer"], seller_name="ArtKart Supplies", tags=["paper", "watercolor"]),
        dict(title="Stretched Canvas 24x36 (2 pack)", description="Triple-primed cotton canvas, kiln-dried frame.", category="Supplies", subcategory="Canvas", price=1599, stock=40, images=[IMG["abstract"]], product_type="physical", seller_id=ids["retailer"], seller_name="ArtKart Supplies", tags=["canvas"]),
        dict(title="Premium Procreate Brush Pack", description="120 textured brushes for digital painting. Instant download.", category="Supplies", subcategory="Digital assets", price=499, stock=999, images=[IMG["digital2"]], product_type="digital", seller_id=ids["retailer"], seller_name="ArtKart Supplies", tags=["procreate", "brushes", "digital"]),
        dict(title="Wedding Invite Suite", description="Complete illustrated wedding invitation suite, print-ready.", category="Events", subcategory="Wedding themes", price=7500, stock=20, images=[IMG["digital3"]], product_type="physical", seller_id=company_id, seller_name="Pixel & Pigment Studio", seller_type="company", tags=["wedding", "invitation"]),
    ]
    for p in products:
        p.update({"status": "approved", "rating": 4.5, "reviews": [], "sales": 0, "created_at": now})
        p.setdefault("seller_type", "user")
    pres = await db.products.insert_many(products)
    pids = pres.inserted_ids

    reels = [
        dict(caption="Layering monsoon skies — full process", media_url=IMG["paint2"], media_type="image", creator_id=ids["meera"], creator_name="Meera Iyer", product_id=pids[0]),
        dict(caption="Charcoal portrait in 40 seconds", media_url=IMG["paint3"], media_type="image", creator_id=ids["aarav"], creator_name="Aarav Sharma", product_id=pids[1]),
        dict(caption="Abstract Geometry No.7 — studio walkthrough", media_url=IMG["abstract"], media_type="image", creator_id=ids["meera"], creator_name="Meera Iyer", product_id=pids[2]),
        dict(caption="Neon Bloom — timelapse", media_url=IMG["digital1"], media_type="image", creator_id=ids["aarav"], creator_name="Aarav Sharma", product_id=pids[3]),
        dict(caption="Throwing the Moon Vase on the wheel", media_url=IMG["clay1"], media_type="image", creator_id=ids["meera"], creator_name="Meera Iyer", product_id=pids[4]),
        dict(caption="Terracotta duo — glazing day", media_url=IMG["clay2"], media_type="image", creator_id=ids["meera"], creator_name="Meera Iyer", product_id=pids[5]),
        dict(caption="Holographic Dream — 4K loop preview", media_url=IMG["digital2"], media_type="image", creator_id=ids["aarav"], creator_name="Aarav Sharma", product_id=pids[6]),
        dict(caption="Wedding suite — foil press day", media_url=IMG["digital3"], media_type="image", creator_id=company_id, creator_name="Pixel & Pigment Studio", creator_type="company", product_id=pids[13]),
    ]
    for r in reels:
        r.update({"likes": [], "saves": [], "shares": 0, "comments": [], "status": "approved", "created_at": now})
        r.setdefault("creator_type", "user")
    await db.reels.insert_many(reels)

    portfolio = [
        dict(user_id=ids["meera"], title="Monsoon Series", description="Six watercolors chasing rain light.", images=[IMG["paint2"], IMG["abstract"]], category="Painting", created_at=now),
        dict(user_id=ids["meera"], title="Clay & Quiet", description="Stoneware vessels, matte glazes.", images=[IMG["clay1"], IMG["clay2"]], category="Crafting", created_at=now),
        dict(user_id=ids["aarav"], title="Portraits 2026", description="Commissioned charcoal portraits.", images=[IMG["paint3"], IMG["studio2"]], category="Sketch", created_at=now),
        dict(user_id=ids["aarav"], title="Neon Botanica", description="Digital illustration series.", images=[IMG["digital1"], IMG["digital2"]], category="Design", created_at=now),
        dict(user_id=ids["owner"], title="Event Identities", description="Wedding and festival design systems.", images=[IMG["digital3"]], category="Events", created_at=now),
    ]
    await db.portfolio.insert_many(portfolio)
    logger.info("Seed complete")
