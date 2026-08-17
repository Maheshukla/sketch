import { Heart, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export function ProductCard({ product, onChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();

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

  return (
    <div
      data-testid={`product-card-${product.id}`}
      onClick={() => navigate(`/product/${product.id}`)}
      className="group cursor-pointer border border-border/60 bg-card"
    >
      <div className="relative overflow-hidden aspect-[4/5]">
        <img
          src={fileUrl(product.images?.[0])}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
        <button
          data-testid={`wishlist-btn-${product.id}`}
          onClick={wishlist}
          className="absolute top-3 right-3 h-8 w-8 bg-black/50 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Heart className="h-4 w-4" />
        </button>
        {product.product_type !== "physical" && (
          <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white font-meta text-[9px] px-2 py-1">
            {product.product_type}
          </span>
        )}
      </div>
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-bold text-sm truncate">{product.title}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{product.seller_name}</p>
          <p className="font-meta text-xs mt-2 text-foreground">{inr(product.price)}</p>
        </div>
        <button
          data-testid={`add-cart-btn-${product.id}`}
          onClick={addCart}
          className="shrink-0 h-9 w-9 border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
        >
          <ShoppingBag className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, testid }) {
  return (
    <div className="border border-border/60 bg-card p-5" data-testid={testid}>
      <p className="font-meta text-[10px] text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-black tracking-tight mt-2">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
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
    open: "bg-amber-500/10 text-amber-500",
    resolved: "bg-emerald-500/10 text-emerald-500",
  };
  return (
    <span data-testid={`status-${status}`} className={`font-meta text-[9px] px-2 py-1 ${colors[status] || "bg-secondary text-muted-foreground"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}
