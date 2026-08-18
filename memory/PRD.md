# Sketch — Product Requirements & Build Log

## Original Problem Statement
A SaaS platform combining Instagram (reels/social), Behance (portfolios), Etsy (marketplace), Fiverr (custom commissions) and an art-supplies marketplace. Roles: Super Admin, Admin, Individual Artist, Company (Owner/Admin/Artist), Retailer, Customer, Customer Support. Features: reels with commerce actions, portfolios, product listings, cart/wishlist/orders, custom-order workflow with advance/full payments and escrow, third-party courier selection, support tickets, moderation, notifications, analytics, RBAC. Web-first, modular, multi-tenant-ready.

## Architecture (as built)
- **Frontend:** React 19 + Tailwind + shadcn/ui, Framer Motion, Lenis smooth scroll, react-masonry-css, recharts. Dark/light theme (gallery aesthetic: Cabinet Grotesk + Satoshi + JetBrains Mono, signal-red accent). `/app/frontend/src/{pages,components,context,lib}`.
- **Backend:** FastAPI monolith (modular files: `server.py` routes, `auth.py` JWT/bcrypt/RBAC, `storage.py` Emergent Object Storage, `seed.py` demo data). All routes under `/api`.
- **DB:** MongoDB (motor). Collections: users, companies, categories, products, reels, portfolio, carts, wishlists, orders, payment_orders, payments (escrow), custom_requests, tickets, notifications, reports, otps, login_attempts, files.
- **Auth:** httpOnly cookie JWT (access 60min + refresh 7d), email/password bcrypt, OTP login (SMS mocked — dev_otp in response), Emergent-managed Google OAuth, brute-force lockout.
- **Payments:** MOCKED Razorpay-shaped gateway ("Sketch Pay"): create → verify → escrow held → released on delivery/completion. Fee engine: 10% platform commission, 5% GST, ₹99 shipping, ₹49 packaging (physical only). Custom orders: 30% advance or full.
- **Couriers:** Ekart, Delhivery, DTDC, Blue Dart, India Post, Shiprocket (seller selects at ship time; buyer sees courier + tracking).
- **Uploads:** Emergent Object Storage via /api/upload, served via /api/files/{path} (JPG/PNG/WEBP/GIF/MP4, 200MB cap, MIME whitelist).

## Implemented (2026-08-17)
- All 9 roles with RBAC-gated routes (frontend + backend)
- Discover masonry feed, full-screen reels (like/comment/share/save/follow/buy/add-to-cart/commission)
- Marketplace with category/type/price filters + global search
- Product detail: hover zoom gallery, fullscreen view, reviews
- Cart → checkout → demo gateway → escrow order; seller ships with courier; buyer confirms delivery → escrow release
- Custom order 9-state pipeline incl. company assignment to team artists
- Studio: reel/product/portfolio upload with moderation queue (pending → admin approve/reject)
- Company management (create, add/remove members, role assignment)
- Admin panel: overview stats, user management/suspend, staff creation (super admin), moderation, reports, tickets, categories
- Support tickets with threaded replies + FAQs; notifications with unread badge; per-role analytics dashboards
- Seeded demo catalog: 6 categories, 14 products, 8 reels, 5 portfolio pieces, 10 accounts

## Testing
- Iteration 1 (testing agent): 28/29 backend tests passed; fixed reel-comment ObjectId 500, review serialization, upload MIME whitelist; frontend smoke passed (auth, discover, reels, marketplace, cart, RBAC redirects).
- Test suite: `/app/backend/tests/backend_test.py`. Credentials: `/app/memory/test_credentials.md`.

## Mocked integrations (swap for production)
- **Payments:** demo gateway, always succeeds. Next: real Razorpay keys (RAZORPAY_KEY_ID/SECRET + webhook) — playbook already researched.
- **SMS OTP:** OTP returned in API response. Next: Twilio/MSG91.

## Iteration 2 — Ecosystem redesign (2026-08-18)
- Navigation rebuilt: desktop (Categories dropdown, Discover/Reels/Marketplace, centered search, wishlist/cart/notifications/profile) + mobile hamburger Sheet with full role-aware menu (incl. My Portfolio/Reels/Products/Custom Requests, Create Company, Become a Retailer, Logout)
- Sticky horizontally-scrollable category bar (13 categories) on Discover + Marketplace
- Amazon-style product cards: hover second-image swap, rating+count, price, shipping/availability, wishlist, add-to-cart, buy-now, hover "Request custom version"
- Shopping: save-for-later (excluded from checkout, survives payment), recently-viewed rail, related products, recommended rail on Discover
- Profile rebuilt (Instagram+Behance): followers/following/orders-completed/profile-views stats, tabs Posts/Reels/Portfolio/Products/Reviews/About, ?tab= deep links
- Settings page: account, privacy, notifications, payments, shipping (courier preference), theme, security — persisted via whitelisted /users/me/settings
- Saved reels page (/saved); customer dashboard hub; company quick links
- Report dialog (inappropriate/copyright/spam) on reels + products with target validation
- New endpoints: /products/recommended, /products/{id}/related, /products/{id}/view, /recently-viewed, /cart/{id}/save-for-later, /users/me/become-retailer, /users/me/settings, /users/{id}/reviews
- Testing: iteration_2 — 44/44 backend tests pass, all 11 UI checks pass (desktop + mobile)

## Iteration 3 — Production ecosystem upgrade (2026-08-18)
- Home: auto-rotating hero banner slider (4 seeded promo banners, arrows, dots, CTAs; admin banner API) + section rails: trending, recommended creators, popular reels, featured collections, digital, handmade, events, wedding, recently viewed
- Profiles: username (auto-gen + editable), website, location, verified badge (admin verify endpoint), role badges, 9-stat row, followers/following dialogs with remove-follower, Saved tab (self), Collections (create/add/featured)
- Reels: random feed, hashtag extraction + filter, infinite scroll (skip/limit + sentinel), like/comment notifications
- Marketplace: discount_pct strikethrough pricing, variations with price deltas, delivery estimates
- Cart: address book CRUD, address required at checkout, nav cart/wishlist count badges
- Orders: 6-state lifecycle (placed→accepted→processing→shipped→delivered→completed, cancelled via reject → escrow refund) via /orders/{id}/status; legacy /ship + /deliver retained
- Custom orders: negotiation message thread + customer counter-offer flow
- Payments: Razorpay test-mode integration (order create + signature verify) activates when RAZORPAY_KEY_ID/SECRET env set; demo gateway fallback otherwise
- UI polish: heavier body font weight (Satoshi 500), card-lift hover shadows, hero entrance animations
- Regression fix: public_user now serializes ObjectId lists (login 500 for followed users)
- Testing: iteration_3 — 59/59 backend tests pass (suite extended with banners/trending/addresses/lifecycle/collections/negotiation/username/verify/hashtags/razorpay-fallback coverage); hero + sections + hashtag filter verified in browser; tester fixed login tz-naive lockout comparison and checkout address_id persistence inline; follow-up fixes applied: hero kicker padding, empty address-edit 400

## Iteration 4 — UI fixes + SaaS architecture gaps (2026-08-18)
- Hero: arrows moved to bottom-right cluster (never overlap text), dots centered, stronger overlay, responsive text spacing
- Mobile menu: scrollable (h-full + overflow-y-auto + data-lenis-prevent on Sheet/Dialog — Lenis was blocking overlay scroll)
- Desktop navbar: Categories dropdown removed (categories live in sticky bar below hero)
- New: "Build your own art platform" — /enquiry public form, POST /api/enquiries, admin enquiries tab with resolve, super-admin notification, home CTA band, mobile menu item
- Addresses: default address (first auto-defaults, star toggle, checkout auto-selects)
- No-refund policy note on cart summary + FAQ entry (all sales final)
- Badges: auth/me returns cart_count, wishlist_count, unread_notifications, message_count; navbar + mobile menu badges
- Testing: iteration_4 — 67/67 backend tests pass (suite extended: enquiries, default addresses, auth/me counters); both reported UI bugs verified fixed by testing agent on desktop + mobile; follow-up fixes applied: ₹NaN budget guard, enquiry rate limit (20/hr/IP) + admin notifications + resolved_by/resolved_at audit, login_attempts TTL index

## Backlog
- P0: Real Razorpay + webhook verification; real SMS OTP provider
- P1: Balance payment for advance-paid custom orders; refunds/disputes flow; live chat; reel video transcoding; saved-reels page; sales analytics aggregation pipeline
- P2: Shiprocket API integration (live rates/labels); internal delivery network; instant delivery; i18n; mobile apps; AI artwork tools (explicitly out of MVP scope)
