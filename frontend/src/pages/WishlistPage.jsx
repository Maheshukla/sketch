import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ProductCard, PageHeader, EmptyState } from "@/components/cards";

export default function WishlistPage() {
  const [items, setItems] = useState([]);
  const load = () => api.get("/wishlist").then((r) => setItems(r.data.items));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-12" data-testid="wishlist-page">
      <PageHeader kicker="Saved" title="Your wishlist." />
      {items.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} onChange={load} />
          ))}
        </div>
      ) : (
        <EmptyState testid="wishlist-empty" title="Nothing saved yet" hint="Tap the heart on any product to save it here." />
      )}
    </div>
  );
}
