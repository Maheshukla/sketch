import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { ProductCard, PageHeader, EmptyState } from "@/components/cards";
import CategoryBar from "@/components/CategoryBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const ptype = params.get("type") || "";
  const [maxPrice, setMaxPrice] = useState("");

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setLoading(true);
    api
      .get("/products", {
        params: {
          ...(q && { q }),
          ...(category && { category }),
          ...(ptype && { product_type: ptype }),
          ...(maxPrice && { max_price: parseFloat(maxPrice) }),
        },
      })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [q, category, ptype, maxPrice]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-12" data-testid="marketplace-page">
      <PageHeader kicker="Marketplace" title="Shop the marketplace."
        sub="Original artwork, handmade craft, digital assets, templates and studio-grade supplies." />

      <CategoryBar value={category} onChange={(v) => setParam("category", v)} />

      <div className="grid lg:grid-cols-[240px_1fr] gap-10 mt-10">
        <aside className="space-y-8" data-testid="marketplace-filters">
          <div>
            <Label className="font-meta text-[10px] text-muted-foreground">Type</Label>
            <Select value={ptype || "all"} onValueChange={(v) => setParam("type", v === "all" ? "" : v)}>
              <SelectTrigger data-testid="filter-type" className="rounded-none mt-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="physical">Physical</SelectItem>
                <SelectItem value="digital">Digital</SelectItem>
                <SelectItem value="software">Software</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-meta text-[10px] text-muted-foreground">Max price (₹)</Label>
            <Input data-testid="filter-max-price" type="number" className="rounded-none mt-3"
              value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="e.g. 5000" />
          </div>
        </aside>

        <div>
          {q && (
            <p className="font-meta text-[10px] text-muted-foreground mb-6" data-testid="search-label">
              Results for “{q}” — {products.length} found
            </p>
          )}
          {loading ? (
            <p className="font-meta text-xs text-muted-foreground">Loading...</p>
          ) : products.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState testid="marketplace-empty" title="Nothing here yet" hint="Try a different search or category." />
          )}
        </div>
      </div>
    </div>
  );
}
