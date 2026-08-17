import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Masonry from "react-masonry-css";
import { motion } from "framer-motion";
import { Clapperboard } from "lucide-react";
import api, { fileUrl, inr } from "@/lib/api";
import { PageHeader } from "@/components/cards";

const CATS = ["All", "Sketch", "Painting", "Crafting", "Design", "Events", "Supplies"];

export default function Discover() {
  const [products, setProducts] = useState([]);
  const [reels, setReels] = useState([]);
  const [cat, setCat] = useState("All");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/products", { params: cat === "All" ? {} : { category: cat } }).then((r) => setProducts(r.data));
  }, [cat]);

  useEffect(() => {
    api.get("/reels").then((r) => setReels(r.data)).catch(() => {});
  }, []);

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
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-12" data-testid="discover-page">
      <PageHeader
        kicker="The Sketch Gallery"
        title="Discover extraordinary work."
        sub="Original artwork, design and craft from independent creators and studios — shoppable straight from the feed."
      />

      <div className="flex gap-2 flex-wrap mb-10" data-testid="category-chips">
        {CATS.map((c) => (
          <button
            key={c}
            data-testid={`chip-${c.toLowerCase()}`}
            onClick={() => setCat(c)}
            className={`font-meta text-[10px] px-4 py-2 border transition-colors ${
              cat === c ? "border-primary text-primary" : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <Masonry breakpointCols={{ default: 4, 1280: 3, 900: 2, 640: 1 }} className="masonry-grid" columnClassName="masonry-grid-col">
        {tiles.map((t, i) => (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.6), duration: 0.5 }}
          >
            {t.type === "product" ? (
              <div
                data-testid={`discover-tile-${t.data.id}`}
                onClick={() => navigate(`/product/${t.data.id}`)}
                className="group cursor-pointer"
              >
                <div className="overflow-hidden border border-border/60">
                  <img
                    src={fileUrl(t.data.images?.[0])}
                    alt={t.data.title}
                    className="w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    style={{ aspectRatio: i % 3 === 0 ? "4/5" : i % 3 === 1 ? "1/1" : "4/3" }}
                  />
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
              <div
                data-testid={`discover-reel-${t.data.id}`}
                onClick={() => navigate("/reels")}
                className="group cursor-pointer relative overflow-hidden border border-border/60"
              >
                <img src={fileUrl(t.data.media_url)} alt={t.data.caption} className="w-full aspect-[9/14] object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 p-4 text-white">
                  <span className="flex items-center gap-1.5 font-meta text-[9px] text-white/80 mb-1.5">
                    <Clapperboard className="h-3 w-3" /> Reel
                  </span>
                  <p className="font-display font-bold text-sm leading-snug">{t.data.caption}</p>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </Masonry>
    </div>
  );
}
