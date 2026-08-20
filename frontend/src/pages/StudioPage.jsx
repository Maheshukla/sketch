import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Clapperboard, ImagePlus, PackagePlus, Trash2, Upload } from "lucide-react";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, StatusBadge } from "@/components/cards";

const CATS = {
  Sketch: ["Pencil sketches", "Portraits", "Character sketches"],
  Painting: ["Watercolor", "Acrylic", "Oil painting"],
  Crafting: ["Handmade gifts", "Paper crafts", "Resin art", "Clay art"],
  Design: ["Illustrations", "Animations", "Motion graphics", "UI/UX design"],
  Events: ["Wedding themes", "Birthday themes", "Festival themes", "Gift designs"],
  Supplies: ["Paint", "Canvas", "Brushes", "Crafting tools", "Art paper", "Packaging materials", "Digital assets", "Software licenses"],
};

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload", fd);
  return data.url;
}

export function FilePicker({ onUploaded, testid, accept = "image/*,video/mp4,video/webm" }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`border border-dashed border-border p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-foreground/40 transition-colors ${busy ? "opacity-50" : ""}`}>
      <Upload className="h-5 w-5 text-muted-foreground" />
      <span className="font-meta text-[9px] text-muted-foreground">{busy ? "Uploading..." : "Upload file"}</span>
      <input data-testid={testid} type="file" accept={accept} className="hidden" disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const url = await uploadFile(f);
            onUploaded(url);
            toast.success("Uploaded");
          } catch (err) {
            toast.error(fmtErr(err));
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }} />
    </label>
  );
}

export default function StudioPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "reel";
  const [verifs, setVerifs] = useState([]);

  useEffect(() => {
    api.get("/verification/my").then((r) => setVerifs(r.data)).catch(() => {});
  }, []);

  const needsKyc = user?.role === "retailer"
    ? !verifs.some((v) => v.subject_type === "user" && v.status === "approved")
    : user?.role?.startsWith("company_")
      ? !verifs.some((v) => v.subject_type === "company" && v.status === "approved")
      : false;
  const [myProducts, setMyProducts] = useState([]);
  const [reel, setReel] = useState({ caption: "", media_url: "", media_type: "image", product_id: "" });
  const [product, setProduct] = useState({ title: "", description: "", category: "Painting", subcategory: "Watercolor", price: "", stock: 1, product_type: "physical", images: [] });
  const [portfolio, setPortfolio] = useState({ title: "", description: "", category: "Painting", images: [] });

  const sellerId = user?.company_id || user?.id;
  const loadProducts = () => {
    if (sellerId) api.get("/products", { params: { seller_id: sellerId, status: "" } }).then((r) => setProductsSafe(r.data));
  };
  const setProductsSafe = (list) => setMyProducts(list.filter((p) => ["pending", "approved", "rejected"].includes(p.status)));
  const loadAll = () => api.get("/products", { params: { status: "pending" } }).then((r) => setMyProducts(r.data.filter((p) => String(p.seller_id) === String(sellerId))));

  useEffect(() => {
    if (sellerId) {
      Promise.all(["pending", "approved", "rejected"].map((s) => api.get("/products", { params: { seller_id: sellerId, status: s } })))
        .then((rs) => setMyProducts(rs.flatMap((r) => r.data)));
    }
  }, [sellerId]);

  const submitReel = async () => {
    if (!reel.media_url || !reel.caption) return toast.error("Add media and a caption");
    try {
      await api.post("/reels", { ...reel, product_id: reel.product_id || "" });
      toast.success("Reel submitted for moderation");
      setReel({ caption: "", media_url: "", media_type: "image", product_id: "" });
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const submitProduct = async () => {
    if (!product.title || !product.price) return toast.error("Title and price are required");
    try {
      await api.post("/products", { ...product, price: parseFloat(product.price), stock: parseInt(product.stock) || 1 });
      toast.success("Product submitted for moderation");
      setProduct({ title: "", description: "", category: "Painting", subcategory: "Watercolor", price: "", stock: 1, product_type: "physical", images: [] });
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const submitPortfolio = async () => {
    if (!portfolio.title || !portfolio.images.length) return toast.error("Title and at least one image required");
    try {
      await api.post("/portfolio", portfolio);
      toast.success("Portfolio piece added");
      setPortfolio({ title: "", description: "", category: "Painting", images: [] });
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const del = async (id) => {
    await api.delete(`/products/${id}`);
    toast.success("Deleted");
    setMyProducts((ps) => ps.filter((p) => p.id !== id));
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="studio-page">
      <PageHeader kicker="Creator Studio" title="Publish & manage."
        sub="Upload reels, list products and curate your portfolio. New content is reviewed by moderators before going live." />

      {needsKyc && (
        <div className="border border-amber-400/50 bg-amber-400/5 p-4 mb-8 flex flex-wrap items-center gap-3" data-testid="kyc-banner">
          <p className="text-sm flex-1">
            <span className="font-display font-bold">Verification required.</span>{" "}
            <span className="text-muted-foreground">Complete KYC to list products and receive orders. Reels and portfolio uploads stay open.</span>
          </p>
          <Button data-testid="kyc-banner-cta" onClick={() => navigate("/verification")} className="rounded-none font-meta text-[10px]">
            Complete KYC
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="rounded-none mb-8">
          <TabsTrigger value="reel" data-testid="studio-tab-reel" className="rounded-none font-meta text-[10px]"><Clapperboard className="h-3.5 w-3.5 mr-2" />Reel / video</TabsTrigger>
          <TabsTrigger value="product" data-testid="studio-tab-product" className="rounded-none font-meta text-[10px]"><PackagePlus className="h-3.5 w-3.5 mr-2" />Product</TabsTrigger>
          <TabsTrigger value="portfolio" data-testid="studio-tab-portfolio" className="rounded-none font-meta text-[10px]"><ImagePlus className="h-3.5 w-3.5 mr-2" />Portfolio</TabsTrigger>
          <TabsTrigger value="listings" data-testid="studio-tab-listings" className="rounded-none font-meta text-[10px]">My listings</TabsTrigger>
        </TabsList>

        <TabsContent value="reel">
          <div className="grid lg:grid-cols-2 gap-8 max-w-4xl">
            <div className="space-y-4">
              <FilePicker testid="reel-media-upload" accept="image/*,video/mp4,video/webm"
                onUploaded={(url) => setReel({ ...reel, media_url: url, media_type: /\.(mp4|webm)$/i.test(url) ? "video" : "image" })} />
              <div>
                <Label className="font-meta text-[10px]">Caption</Label>
                <Textarea data-testid="reel-caption" className="rounded-none mt-1" value={reel.caption}
                  onChange={(e) => setReel({ ...reel, caption: e.target.value })} placeholder="Tell the story of this piece..." />
              </div>
              <div>
                <Label className="font-meta text-[10px]">Link a product (optional)</Label>
                <Select value={reel.product_id} onValueChange={(v) => setReel({ ...reel, product_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="reel-product-select" className="rounded-none mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="none">None</SelectItem>
                    {myProducts.filter((p) => p.status === "approved").map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button data-testid="reel-submit" onClick={submitReel} className="rounded-none font-meta text-[10px] h-11 px-8">Publish reel</Button>
            </div>
            {reel.media_url && (
              <div className="border border-border/60 aspect-[9/14] max-h-[480px] overflow-hidden">
                {reel.media_type === "video"
                  ? <video src={fileUrl(reel.media_url)} controls className="h-full w-full object-cover" />
                  : <img src={fileUrl(reel.media_url)} alt="" className="h-full w-full object-cover" />}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="product">
          <div className="grid lg:grid-cols-2 gap-8 max-w-5xl">
            <div className="space-y-4">
              <div>
                <Label className="font-meta text-[10px]">Title</Label>
                <Input data-testid="product-title" className="rounded-none mt-1" value={product.title}
                  onChange={(e) => setProduct({ ...product, title: e.target.value })} />
              </div>
              <div>
                <Label className="font-meta text-[10px]">Description</Label>
                <Textarea data-testid="product-description" className="rounded-none mt-1" rows={3} value={product.description}
                  onChange={(e) => setProduct({ ...product, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-meta text-[10px]">Category</Label>
                  <Select value={product.category} onValueChange={(v) => setProduct({ ...product, category: v, subcategory: CATS[v][0] })}>
                    <SelectTrigger data-testid="product-category" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      {Object.keys(CATS).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Subcategory</Label>
                  <Select value={product.subcategory} onValueChange={(v) => setProduct({ ...product, subcategory: v })}>
                    <SelectTrigger data-testid="product-subcategory" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      {CATS[product.category].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="font-meta text-[10px]">Price (₹)</Label>
                  <Input data-testid="product-price" type="number" className="rounded-none mt-1" value={product.price}
                    onChange={(e) => setProduct({ ...product, price: e.target.value })} />
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Stock</Label>
                  <Input data-testid="product-stock" type="number" className="rounded-none mt-1" value={product.stock}
                    onChange={(e) => setProduct({ ...product, stock: e.target.value })} />
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Type</Label>
                  <Select value={product.product_type} onValueChange={(v) => setProduct({ ...product, product_type: v })}>
                    <SelectTrigger data-testid="product-type" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="software">Software</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button data-testid="product-submit" onClick={submitProduct} className="rounded-none font-meta text-[10px] h-11 px-8">List product</Button>
            </div>
            <div>
              <FilePicker testid="product-image-upload" accept="image/*"
                onUploaded={(url) => setProduct({ ...product, images: [...product.images, url] })} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {product.images.map((img, i) => (
                  <div key={i} className="relative group border border-border/60 aspect-square overflow-hidden">
                    <img src={fileUrl(img)} alt="" className="h-full w-full object-cover" />
                    <button data-testid={`remove-image-${i}`}
                      onClick={() => setProduct({ ...product, images: product.images.filter((_, j) => j !== i) })}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="portfolio">
          <div className="grid lg:grid-cols-2 gap-8 max-w-4xl">
            <div className="space-y-4">
              <div>
                <Label className="font-meta text-[10px]">Project title</Label>
                <Input data-testid="portfolio-title" className="rounded-none mt-1" value={portfolio.title}
                  onChange={(e) => setPortfolio({ ...portfolio, title: e.target.value })} />
              </div>
              <div>
                <Label className="font-meta text-[10px]">Description</Label>
                <Textarea data-testid="portfolio-description" className="rounded-none mt-1" rows={3} value={portfolio.description}
                  onChange={(e) => setPortfolio({ ...portfolio, description: e.target.value })} />
              </div>
              <Button data-testid="portfolio-submit" onClick={submitPortfolio} className="rounded-none font-meta text-[10px] h-11 px-8">Add to portfolio</Button>
            </div>
            <div>
              <FilePicker testid="portfolio-image-upload" accept="image/*"
                onUploaded={(url) => setPortfolio({ ...portfolio, images: [...portfolio.images, url] })} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {portfolio.images.map((img, i) => (
                  <img key={i} src={fileUrl(img)} alt="" className="border border-border/60 aspect-square object-cover" />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="listings">
          <div className="border border-border/60" data-testid="listings-table">
            <div className="grid grid-cols-[1fr_120px_100px_120px_60px] gap-4 px-5 py-3 border-b border-border/60 font-meta text-[9px] text-muted-foreground">
              <span>Product</span><span>Price</span><span>Stock</span><span>Status</span><span></span>
            </div>
            {myProducts.map((p) => (
              <div key={p.id} data-testid={`listing-${p.id}`} className="grid grid-cols-[1fr_120px_100px_120px_60px] gap-4 px-5 py-3 border-b border-border/40 items-center text-sm">
                <span className="truncate font-display font-bold">{p.title}</span>
                <span className="font-meta text-xs">{inr(p.price)}</span>
                <span>{p.product_type === "physical" ? p.stock : "∞"}</span>
                <StatusBadge status={p.status} />
                <button data-testid={`delete-listing-${p.id}`} onClick={() => del(p.id)} className="text-muted-foreground hover:text-primary transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!myProducts.length && <p className="px-5 py-8 text-sm text-muted-foreground">No listings yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
