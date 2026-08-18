import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Heart, ShoppingBag, Star, Zap } from "lucide-react";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomRequestDialog } from "@/pages/ReelsPage";
import { StatusBadge, ProductCard, ReportDialog } from "@/components/cards";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState("50% 50%");
  const [review, setReview] = useState({ rating: 5, text: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [related, setRelated] = useState([]);
  const imgRef = useRef(null);

  const load = () => api.get(`/products/${id}`).then((r) => setProduct(r.data)).catch(() => navigate("/marketplace"));
  useEffect(() => {
    setActiveImg(0);
    load();
    api.post(`/products/${id}/view`).catch(() => {});
    api.get(`/products/${id}/related`).then((r) => setRelated(r.data)).catch(() => {});
  }, [id]);

  if (!product) return <div className="min-h-screen" />;

  const needAuth = () => {
    if (!user) {
      navigate("/auth");
      return true;
    }
    return false;
  };

  const addCart = async () => {
    if (needAuth()) return;
    try {
      await api.post("/cart", { product_id: id, qty: 1 });
      toast.success("Added to cart");
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const buyNow = async () => {
    if (needAuth()) return;
    await api.post("/cart", { product_id: id, qty: 1 });
    navigate("/cart");
  };

  const wishlist = async () => {
    if (needAuth()) return;
    const { data } = await api.post(`/wishlist/${id}`);
    toast.success(data.wishlisted ? "Saved to wishlist" : "Removed");
  };

  const submitReview = async () => {
    if (needAuth()) return;
    try {
      await api.post(`/products/${id}/reviews`, review);
      toast.success("Review posted");
      setReview({ rating: 5, text: "" });
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const onZoomMove = (e) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos(`${x}% ${y}%`);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-12" data-testid="product-detail-page">
      <div className="grid lg:grid-cols-2 gap-12">
        <div>
          <div
            ref={imgRef}
            onMouseMove={onZoomMove}
            onClick={() => setZoomOpen(true)}
            className="border border-border/60 overflow-hidden cursor-zoom-in group relative aspect-[4/5]"
            data-testid="product-gallery"
          >
            <img
              src={fileUrl(product.images?.[activeImg])}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-150"
              style={{ transformOrigin: zoomPos }}
            />
          </div>
          {product.images?.length > 1 && (
            <div className="flex gap-2 mt-3">
              {product.images.map((img, i) => (
                <button key={i} data-testid={`thumb-${i}`} onClick={() => setActiveImg(i)}
                  className={`h-20 w-20 border overflow-hidden ${i === activeImg ? "border-primary" : "border-border/60"}`}>
                  <img src={fileUrl(img)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="font-meta text-[10px] text-primary mb-3">{product.category} / {product.subcategory}</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter leading-none" data-testid="product-title">
            {product.title}
          </h1>
          <div className="flex items-center gap-3 mt-4">
            <span className="flex items-center gap-1 text-sm">
              <Star className="h-4 w-4 fill-foreground" /> {product.rating || "New"}
            </span>
            <span className="font-meta text-[9px] text-muted-foreground">{product.reviews?.length || 0} reviews</span>
            <StatusBadge status={product.product_type} />
          </div>

          <p className="font-meta text-2xl mt-8" data-testid="product-price">{inr(product.price)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {product.product_type === "physical" ? (product.stock > 0 ? `${product.stock} in stock` : "Out of stock") : "Instant download after purchase"}
          </p>

          <p className="text-muted-foreground leading-relaxed mt-6 max-w-lg">{product.description}</p>

          <div className="flex flex-wrap gap-3 mt-8">
            <Button data-testid="buy-now-button" onClick={buyNow} disabled={product.product_type === "physical" && product.stock < 1}
              className="rounded-none font-meta text-[11px] h-12 px-8">
              <Zap className="h-4 w-4 mr-2" /> Buy now
            </Button>
            <Button data-testid="add-to-cart-button" onClick={addCart} variant="outline" className="rounded-none font-meta text-[11px] h-12 px-8">
              <ShoppingBag className="h-4 w-4 mr-2" /> Add to cart
            </Button>
            <Button data-testid="wishlist-toggle" onClick={wishlist} variant="outline" size="icon" className="rounded-none h-12 w-12">
              <Heart className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-10 border border-border/60 p-5 flex items-center gap-4" data-testid="seller-card">
            <Avatar className="h-12 w-12 rounded-none">
              <AvatarImage src="" />
              <AvatarFallback className="rounded-none font-display font-bold">{product.seller_name?.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold">{product.seller_name}</p>
              <p className="font-meta text-[9px] text-muted-foreground">{product.seller_type === "company" ? "Creative studio" : "Independent creator"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" data-testid="view-seller" onClick={() => navigate(`/profile/${product.seller_id}`)} className="rounded-none font-meta text-[10px]">
                View
              </Button>
              <Button variant="outline" data-testid="request-custom-from-seller" onClick={() => (needAuth() ? null : setShowCustom(true))}
                className="rounded-none font-meta text-[10px]">
                Commission
              </Button>
            </div>
          </div>
          <button data-testid="report-product" onClick={() => setShowReport(true)}
            className="mt-3 text-[11px] text-muted-foreground hover:text-primary transition-colors">
            Report this listing
          </button>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20" data-testid="related-products">
          <h2 className="font-display text-2xl font-black tracking-tight mb-6">Related work</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <section className="mt-20 max-w-3xl">
        <h2 className="font-display text-2xl font-black tracking-tight mb-6">Reviews</h2>
        <div className="space-y-4 mb-8">
          {(product.reviews || []).map((r) => (
            <div key={r.id} className="border border-border/60 p-4" data-testid={`review-${r.id}`}>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm">{r.user_name}</span>
                <span className="flex">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-foreground" />)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{r.text}</p>
            </div>
          ))}
          {!product.reviews?.length && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
        </div>
        {user && (
          <div className="border border-border/60 p-5 space-y-3" data-testid="review-form">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} data-testid={`rating-${n}`} onClick={() => setReview({ ...review, rating: n })}>
                  <Star className={`h-5 w-5 ${n <= review.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <Textarea data-testid="review-text" className="rounded-none" placeholder="Share your experience..." value={review.text}
              onChange={(e) => setReview({ ...review, text: e.target.value })} />
            <Button data-testid="review-submit" onClick={submitReview} className="rounded-none font-meta text-[10px]">Post review</Button>
          </div>
        )}
      </section>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="rounded-none max-w-5xl p-0 border-none bg-black" data-testid="zoom-dialog">
          <DialogTitle className="sr-only">{product.title}</DialogTitle>
          <DialogDescription className="sr-only">Full-screen artwork preview</DialogDescription>
          <img src={fileUrl(product.images?.[activeImg])} alt={product.title} className="w-full max-h-[85vh] object-contain" />
        </DialogContent>
      </Dialog>

      <CustomRequestDialog open={showCustom} onClose={() => setShowCustom(false)}
        targetId={product.seller_id} targetType={product.seller_type === "company" ? "company" : "user"}
        targetName={product.seller_name} />
      <ReportDialog open={showReport} onClose={() => setShowReport(false)} targetType="product" targetId={product.id} />
    </div>
  );
}
