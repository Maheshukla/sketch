import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Masonry from "react-masonry-css";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Brush, Clapperboard, Compass, ShoppingBag, UserPlus } from "lucide-react";
import api, { fileUrl, inr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, ProductCard, EmptyState } from "@/components/cards";
import CategoryBar from "@/components/CategoryBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function Discover() {
  const [products, setProducts] = useState([]);
  const [reels, setReels] = useState([]);
  const [banners, setBanners] = useState([]);
  const [trending, setTrending] = useState([]);
  const [creators, setCreators] = useState([]);
  const [popularReels, setPopularReels] = useState([]);
  const [collections, setCollections] = useState([]);
  const [digital, setDigital] = useState([]);
  const [handmade, setHandmade] = useState([]);
  const [events, setEvents] = useState([]);
  const [wedding, setWedding] = useState([]);
  const [recent, setRecent] = useState([]);
  const [cat, setCat] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/products", { params: cat ? { category: cat } : {} }).then((r) => setProducts(r.data));
  }, [cat]);

  useEffect(() => {
    api.get("/banners").then((r) => setBanners(r.data)).catch(() => {});
    api.get("/reels").then((r) => setReels(r.data)).catch(() => {});
    api.get("/products/trending").then((r) => setTrending(r.data)).catch(() => {});
    api.get("/creators/recommended").then((r) => setCreators(r.data)).catch(() => {});
    api.get("/reels", { params: { sort: "popular" } }).then((r) => setPopularReels(r.data)).catch(() => {});
    api.get("/collections/featured").then((r) => setCollections(r.data)).catch(() => {});
    api.get("/products", { params: { product_type: "digital" } }).then((r) => setDigital(r.data.slice(0, 8))).catch(() => {});
    Promise.all([
      api.get("/products", { params: { category: "Crafting" } }),
      api.get("/products", { params: { category: "Handmade" } }),
    ]).then(([a, b]) => setHandmade([...a.data, ...b.data].slice(0, 8))).catch(() => {});
    api.get("/products", { params: { category: "Events" } }).then((r) => setEvents(r.data.slice(0, 8))).catch(() => {});
    api.get("/products", { params: { category: "Wedding" } }).then((r) => setWedding(r.data.slice(0, 8))).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) api.get("/recently-viewed").then((r) => setRecent(r.data.items.slice(0, 8))).catch(() => {});
  }, [user]);

  const tiles = [];
  const reelPool = [...reels];
  products.forEach((p, i) => {
    tiles.push({ type: "product", data: p, key: `p-${p.id}` });
    if ((i + 1) % 4 === 0 && reelPool.length) {
      const r = reelPool.shift();
      tiles.push({ type: "reel", data: r, key: `r-${r.id}` });
    }
  });

  return (
    <div data-testid="discover-page">
      <Hero banners={banners} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-8">
        <CategoryBar value={cat} onChange={setCat} />

        {!cat && (
          <>
            {trending.length > 0 && (
              <Rail kicker="Trending now" title="Trending artworks" testid="section-trending">
                {trending.map((p) => <RailCard key={`tr-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}

            {creators.length > 0 && (
              <Rail kicker="Community" title="Recommended creators" testid="section-creators">
                {creators.map((c) => <CreatorCard key={`cr-${c.id}`} creator={c} />)}
              </Rail>
            )}

            {popularReels.length > 0 && (
              <Rail kicker="Watch" title="Popular reels" testid="section-popular-reels">
                {popularReels.slice(0, 8).map((r) => <ReelTile key={`pr-${r.id}`} reel={r} />)}
              </Rail>
            )}

            {collections.length > 0 && (
              <Rail kicker="Curated" title="Featured collections" testid="section-collections">
                {collections.map((c) => <CollectionCard key={`col-${c.id}`} collection={c} />)}
              </Rail>
            )}

            {digital.length > 0 && (
              <Rail kicker="Instant downloads" title="Digital products" testid="section-digital" link="/marketplace?type=digital">
                {digital.map((p) => <RailCard key={`dg-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}

            {handmade.length > 0 && (
              <Rail kicker="Made by hand" title="Handmade products" testid="section-handmade" link="/marketplace?category=Handmade">
                {handmade.map((p) => <RailCard key={`hm-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}

            {events.length > 0 && (
              <Rail kicker="Celebrate" title="Upcoming events & themes" testid="section-events" link="/marketplace?category=Events">
                {events.map((p) => <RailCard key={`ev-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}

            {wedding.length > 0 && (
              <Rail kicker="The big day" title="Wedding services" testid="section-wedding" link="/marketplace?category=Wedding">
                {wedding.map((p) => <RailCard key={`wd-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}

            {recent.length > 0 && (
              <Rail kicker="Pick up where you left off" title="Recently viewed" testid="section-recent">
                {recent.map((p) => <RailCard key={`rv-${p.id}`}><ProductCard product={p} /></RailCard>)}
              </Rail>
            )}
          </>
        )}

        <section className="mt-16">
          <PageHeader kicker="Browse everything" title={cat ? cat : "Explore the feed."} />
          {tiles.length ? (
            <Masonry breakpointCols={{ default: 4, 1280: 3, 900: 2, 640: 1 }} className="masonry-grid" columnClassName="masonry-grid-col">
              {tiles.map((t, i) => (
                <motion.div key={t.key} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5 }}>
                  {t.type === "product" ? (
                    <div data-testid={`discover-tile-${t.data.id}`} onClick={() => navigate(`/product/${t.data.id}`)} className="group cursor-pointer">
                      <div className="overflow-hidden border border-border/60">
                        <img src={fileUrl(t.data.images?.[0])} alt={t.data.title}
                          className="w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                          style={{ aspectRatio: i % 3 === 0 ? "4/5" : i % 3 === 1 ? "1/1" : "4/3" }} />
                      </div>
                      <div className="pt-3 flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display font-bold truncate">{t.data.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.data.seller_name}</p>
                        </div>
                        <p className="font-meta text-xs shrink-0">{inr(t.data.price)}</p>
                      </div>
                    </div>
                  ) : (
                    <ReelTile reel={t.data} tall />
                  )}
                </motion.div>
              ))}
            </Masonry>
          ) : (
            <EmptyState testid="explore-empty" title="Nothing in this category yet" hint="Check back soon — creators publish daily." />
          )}
        </section>

        <section className="mt-20 mb-16 border border-border/60 bg-card p-8 sm:p-12 flex flex-col sm:flex-row items-start sm:items-center gap-6 justify-between" data-testid="platform-enquiry-cta">
          <div>
            <p className="font-meta text-[10px] text-primary mb-2">For brands & studios</p>
            <h2 className="font-display text-3xl sm:text-4xl font-black tracking-tighter">Build your own art platform.</h2>
            <p className="text-muted-foreground text-sm mt-3 max-w-lg">
              Sketch powers white-label creative ecosystems — marketplaces, reels, commissions and payouts. Tell us your requirement and budget.
            </p>
          </div>
          <Button data-testid="enquiry-cta-btn" onClick={() => navigate("/enquiry")}
            className="rounded-none font-meta text-[11px] h-12 px-8 shrink-0">
            Submit an enquiry
          </Button>
        </section>
      </div>
    </div>
  );
}

function Hero({ banners }) {
  const [slide, setSlide] = useState(0);
  const navigate = useNavigate();
  const count = banners.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % count), 4500);
    return () => clearInterval(t);
  }, [count]);

  if (!count) {
    return (
      <section className="relative h-[62vh] sm:h-[70vh] overflow-hidden bg-secondary/40 flex items-end" data-testid="hero-empty">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 pb-20 sm:pb-24 w-full">
          <p className="font-meta text-[10px] sm:text-[11px] text-primary" data-testid="hero-tag">The creative marketplace</p>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95] mt-3" data-testid="hero-title">Sketch.</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-4 max-w-lg">Discover original art, commission creators, and shop supplies — all in one place.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Button data-testid="hero-cta-explore" onClick={() => navigate("/marketplace")}
              className="rounded-none font-meta text-[11px] h-11 sm:h-12 px-6 sm:px-8">
              <Compass className="h-4 w-4 mr-2" /> Explore artwork
            </Button>
          </div>
        </div>
      </section>
    );
  }
  const active = banners[slide];

  return (
    <section className="relative h-[62vh] sm:h-[70vh] overflow-hidden bg-black" data-testid="hero-banner">
      {banners.map((b, i) => (
        <img key={b.id || i} src={fileUrl(b.image)} alt={b.title}
          className={`hero-slide absolute inset-0 h-full w-full object-cover ${i === slide ? "opacity-60" : "opacity-0"}`} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/25" />

      <div className="relative z-10 h-full max-w-[1600px] mx-auto px-4 sm:px-8 flex flex-col justify-end pb-20 sm:pb-24 text-white">
        <div key={slide} className="hero-content max-w-2xl">
          <p className="font-meta text-[10px] sm:text-[11px] text-primary" data-testid="hero-tag">{active.tag}</p>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95] mt-3" data-testid="hero-title">
            {active.title}
          </h1>
          <p className="text-white/70 text-sm sm:text-base mt-4 max-w-lg">{active.subtitle}</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Button data-testid="hero-cta-primary" onClick={() => navigate(active.cta_link)}
              className="rounded-none font-meta text-[11px] h-11 sm:h-12 px-6 sm:px-8 bg-primary hover:bg-primary/90">
              {active.cta_label}
            </Button>
            <Button data-testid="hero-cta-explore" variant="outline" onClick={() => navigate("/marketplace")}
              className="rounded-none font-meta text-[11px] h-11 sm:h-12 px-6 sm:px-8 bg-black/30 backdrop-blur-md text-white border-white/40 hover:bg-white hover:text-black">
              <Compass className="h-4 w-4 mr-2" /> Explore artwork
            </Button>
            <Button data-testid="hero-cta-creator" variant="outline" onClick={() => navigate("/auth")}
              className="rounded-none font-meta text-[11px] h-11 sm:h-12 px-6 sm:px-8 bg-black/30 backdrop-blur-md text-white border-white/40 hover:bg-white hover:text-black">
              <Brush className="h-4 w-4 mr-2" /> Become a creator
            </Button>
          </div>
        </div>

        {count > 1 && (
          <>
            <div className="absolute bottom-6 right-4 sm:right-8 flex gap-2" data-testid="hero-arrows">
              <button data-testid="hero-prev" onClick={() => setSlide((slide - 1 + count) % count)}
                className="h-10 w-10 border border-white/30 bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button data-testid="hero-next" onClick={() => setSlide((slide + 1) % count)}
                className="h-10 w-10 border border-white/30 bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors">
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex gap-2" data-testid="hero-dots">
              {banners.map((_, i) => (
                <button key={i} data-testid={`hero-dot-${i}`} onClick={() => setSlide(i)}
                  className={`h-1 transition-all ${i === slide ? "w-8 bg-primary" : "w-3 bg-white/40 hover:bg-white/70"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Rail({ kicker, title, children, link, testid }) {
  const navigate = useNavigate();
  return (
    <section className="mt-14" data-testid={testid}>
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="font-meta text-[10px] text-primary mb-1.5">{kicker}</p>
          <h2 className="font-display text-2xl sm:text-3xl font-black tracking-tighter">{title}</h2>
        </div>
        {link && (
          <button onClick={() => navigate(link)} className="font-meta text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
            View all →
          </button>
        )}
      </div>
      <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">{children}</div>
    </section>
  );
}

function RailCard({ children }) {
  return <div className="w-56 sm:w-64 shrink-0">{children}</div>;
}

function CreatorCard({ creator }) {
  const navigate = useNavigate();
  return (
    <div data-testid={`creator-card-${creator.id}`} onClick={() => navigate(`/profile/${creator.id}`)}
      className="card-lift w-44 shrink-0 border border-border/60 bg-card p-5 flex flex-col items-center text-center cursor-pointer">
      <Avatar className="h-16 w-16 rounded-none">
        <AvatarImage src={fileUrl(creator.avatar)} />
        <AvatarFallback className="rounded-none font-display font-bold">{creator.name?.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <p className="font-display font-bold text-sm mt-3 truncate w-full">{creator.name}</p>
      <p className="font-meta text-[9px] text-muted-foreground mt-1">{creator.specialty || creator.role?.replace("_", " ")}</p>
      <p className="text-[11px] text-muted-foreground mt-2">{creator.follower_count} followers</p>
      <span className="mt-3 font-meta text-[9px] text-primary flex items-center gap-1">
        <UserPlus className="h-3 w-3" /> Follow
      </span>
    </div>
  );
}

function ReelTile({ reel, tall }) {
  const navigate = useNavigate();
  return (
    <div data-testid={`reel-tile-${reel.id}`} onClick={() => navigate("/reels")}
      className={`group cursor-pointer relative overflow-hidden border border-border/60 shrink-0 ${tall ? "w-full" : "w-44"}`}>
      <img src={fileUrl(reel.media_url)} alt={reel.caption}
        className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${tall ? "aspect-[9/14]" : "aspect-[9/14]"}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute bottom-0 p-3 text-white w-full">
        <span className="flex items-center gap-1.5 font-meta text-[8px] text-white/80 mb-1">
          <Clapperboard className="h-3 w-3" /> {reel.creator_name}
        </span>
        <p className="font-display font-bold text-xs leading-snug line-clamp-2">{reel.caption}</p>
      </div>
    </div>
  );
}

function CollectionCard({ collection }) {
  const navigate = useNavigate();
  const cover = collection.products?.[0]?.images?.[0];
  return (
    <div data-testid={`collection-${collection.id}`}
      onClick={() => collection.products?.[0] && navigate(`/profile/${collection.user_id}?tab=collections`)}
      className="card-lift w-64 shrink-0 border border-border/60 bg-card cursor-pointer">
      <div className="grid grid-cols-2 gap-px bg-border/60">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square bg-secondary overflow-hidden">
            {collection.products?.[i] && (
              <img src={fileUrl(collection.products[i].images?.[0])} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        ))}
      </div>
      <div className="p-4">
        <p className="font-display font-bold text-sm">{collection.name}</p>
        <p className="font-meta text-[9px] text-muted-foreground mt-1">{collection.products?.length || 0} pieces · curated</p>
      </div>
    </div>
  );
}
