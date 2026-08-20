import { Heart, MessageCircle, ShoppingBag, Star, Zap, Sparkles, Flag } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CustomRequestDialog } from "@/pages/ReelsPage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function Stars({ rating, count }) {
  return (
    <span className="flex items-center gap-1" data-testid="rating-stars">
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`h-3 w-3 ${n <= Math.round(rating || 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
        ))}
      </span>
      {count !== undefined && <span className="text-[11px] text-muted-foreground">({count})</span>}
    </span>
  );
}

export function ProductCard({ product, onChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hover, setHover] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const wishlist = async (e) => {
    e.stopPropagation();
    if (!user) return navigate("/auth");
    try {
      const { data } = await api.post(`/wishlist/${product.id}`);
      toast.success(data.wishlisted ? "Saved to wishlist" : "Removed from wishlist");
      onChange?.();
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const addCart = async (e) => {
    e.stopPropagation();
    if (!user) return navigate("/auth");
    try {
      await api.post("/cart", { product_id: product.id, qty: 1 });
      toast.success("Added to cart");
    } catch (err) {
      toast.error(fmtErr(err));
    }
  };

  const buyNow = async (e) => {
    e.stopPropagation();
    if (!user) return navigate("/auth");
    await api.post("/cart", { product_id: product.id, qty: 1 });
    navigate("/cart");
  };

  const img = hover && product.images?.[1] ? product.images[1] : product.images?.[0];
  const inStock = product.product_type !== "physical" || product.stock > 0;
  const disc = product.discount_pct || 0;
  const finalPrice = disc ? Math.round(product.price * (1 - disc / 100)) : product.price;

  return (
    <div
      data-testid={`product-card-${product.id}`}
      onClick={() => navigate(`/product/${product.id}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="card-lift group cursor-pointer border border-border/60 bg-card flex flex-col"
    >
      <div className="relative overflow-hidden aspect-square">
        <img
          src={fileUrl(img)}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
        <button
          data-testid={`wishlist-btn-${product.id}`}
          onClick={wishlist}
          className="absolute top-3 right-3 h-8 w-8 bg-black/50 backdrop-blur-md text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        >
          <Heart className="h-4 w-4" />
        </button>
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {disc > 0 && (
            <span className="bg-primary text-primary-foreground font-meta text-[9px] px-2 py-1" data-testid={`discount-badge-${product.id}`}>
              -{disc}%
            </span>
          )}
          {product.product_type !== "physical" && (
            <span className="bg-black/60 backdrop-blur-md text-white font-meta text-[9px] px-2 py-1">
              {product.product_type}
            </span>
          )}
        </div>
        <button
          data-testid={`custom-version-btn-${product.id}`}
          onClick={(e) => { e.stopPropagation(); user ? setShowCustom(true) : navigate("/auth"); }}
          className="absolute bottom-3 left-3 right-3 bg-white/90 dark:bg-black/80 backdrop-blur-md text-foreground font-meta text-[9px] py-2.5 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Request custom version
        </button>
      </div>
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <p className="text-[11px] text-muted-foreground truncate">{product.seller_name}</p>
        <p className="font-display font-bold text-sm leading-snug line-clamp-2">{product.title}</p>
        <Stars rating={product.rating} count={product.reviews?.length ?? 0} />
        <p className="font-meta text-base mt-0.5">
          {inr(finalPrice)}
          {disc > 0 && <span className="text-muted-foreground line-through text-xs ml-2">{inr(product.price)}</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {product.product_type === "physical" ? "+ ₹99 shipping · " : "Instant download · "}
          <span className={inStock ? "text-emerald-500" : "text-primary"}>{inStock ? "In stock" : "Out of stock"}</span>
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            data-testid={`add-cart-btn-${product.id}`}
            onClick={addCart}
            className="h-9 border border-border flex items-center justify-center gap-1.5 font-meta text-[9px] hover:border-foreground/50 transition-colors"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Add to cart
          </button>
          <button
            data-testid={`buy-now-btn-${product.id}`}
            onClick={buyNow}
            className="h-9 bg-primary text-primary-foreground flex items-center justify-center gap-1.5 font-meta text-[9px] hover:opacity-90 transition-opacity"
          >
            <Zap className="h-3.5 w-3.5" /> Buy now
          </button>
        </div>
      </div>
      <CustomRequestDialog open={showCustom} onClose={() => setShowCustom(false)}
        targetId={product.seller_id} targetType={product.seller_type === "company" ? "company" : "user"}
        targetName={product.seller_name} />
    </div>
  );
}

export function StatCard({ label, value, sub, testid, onClick }) {
  const interactive = !!onClick;
  return (
    <div
      className={`border border-border/60 bg-card p-5 ${interactive ? "cursor-pointer hover:border-foreground/50 hover:bg-secondary/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary" : ""}`}
      data-testid={testid}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <p className="font-meta text-[10px] text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-black tracking-tight mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {interactive && <p className="font-meta text-[8px] text-primary mt-2 opacity-0 group-hover:opacity-100">Open →</p>}
    </div>
  );
}

export function WhatsAppButton({ reference, label = "Chat on WhatsApp", testid = "whatsapp-btn" }) {
  const msg = encodeURIComponent(
    reference ? `Hello Sketch Support, I need help with ${reference}.` : "Hello Sketch Support, I need help with my account/order."
  );
  return (
    <a data-testid={testid} href={`https://wa.me/918004513580?text=${msg}`} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 border border-emerald-500/50 text-emerald-500 px-4 h-10 font-meta text-[10px] hover:bg-emerald-500 hover:text-white transition-colors">
      <MessageCircle className="h-4 w-4" /> {label}
    </a>
  );
}

export function EmptyState({ title, hint, testid }) {
  return (
    <div className="border border-dashed border-border p-16 text-center" data-testid={testid}>
      <p className="font-display text-2xl font-bold tracking-tight">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

export function PageHeader({ kicker, title, sub }) {
  return (
    <div className="mb-10">
      {kicker && <p className="font-meta text-[11px] text-primary mb-3">{kicker}</p>}
      <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-none">{title}</h1>
      {sub && <p className="text-muted-foreground mt-3 max-w-xl">{sub}</p>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const colors = {
    approved: "bg-emerald-500/10 text-emerald-500",
    rejected: "bg-red-500/10 text-red-500",
    pending: "bg-amber-500/10 text-amber-500",
    completed: "bg-emerald-500/10 text-emerald-500",
    delivered: "bg-emerald-500/10 text-emerald-500",
    shipped: "bg-blue-500/10 text-blue-500",
    placed: "bg-blue-500/10 text-blue-500",
    accepted: "bg-blue-500/10 text-blue-500",
    processing: "bg-violet-400/10 text-violet-400",
    cancelled: "bg-red-500/10 text-red-500",
    open: "bg-amber-500/10 text-amber-500",
    resolved: "bg-emerald-500/10 text-emerald-500",
  };
  return (
    <span data-testid={`status-${status}`} className={`font-meta text-[9px] px-2 py-1 ${colors[status] || "bg-secondary text-muted-foreground"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

export function ReportDialog({ open, onClose, targetType, targetId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("inappropriate");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return navigate("/auth");
    if (!reason.trim()) return toast.error("Describe the issue");
    setBusy(true);
    try {
      await api.post("/reports", { target_type: targetType, target_id: targetId, reason: `[${category}] ${reason}` });
      toast.success("Report submitted — our moderators will review it");
      onClose();
      setReason("");
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-md" data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" /> Report {targetType}
          </DialogTitle>
          <DialogDescription className="sr-only">Report inappropriate, copyright-infringing or spam content</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {["inappropriate", "copyright", "spam"].map((c) => (
              <button key={c} data-testid={`report-type-${c}`} onClick={() => setCategory(c)}
                className={`font-meta text-[9px] px-3 py-2 border transition-colors ${category === c ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}>
                {c === "copyright" ? "Copyright violation" : c}
              </button>
            ))}
          </div>
          <Textarea data-testid="report-reason" className="rounded-none" rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="Tell us what's wrong with this content..." />
          <Button data-testid="report-submit" onClick={submit} disabled={busy} className="w-full rounded-none font-meta text-[10px] h-10">
            {busy ? "Submitting..." : "Submit report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
