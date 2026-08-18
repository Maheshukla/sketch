import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Minus, Plus, Trash2, ShieldCheck, BookmarkPlus, ArrowUpToLine, MapPin, Pencil, Star } from "lucide-react";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState, ProductCard } from "@/components/cards";

const METHODS = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Credit / Debit card" },
  { value: "netbanking", label: "Net banking" },
  { value: "wallet", label: "Wallet" },
];

export function calcBreakdown(items) {
  const subtotal = items.reduce((s, i) => s + (i.final_price ?? i.price) * i.qty, 0);
  const physical = items.some((i) => i.product_type === "physical");
  const tax = Math.round(subtotal * 0.05);
  const shipping = physical ? 99 : 0;
  const packaging = physical ? 49 : 0;
  return { subtotal, tax, shipping, packaging, total: subtotal + tax + shipping + packaging };
}

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [recent, setRecent] = useState([]);
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState("upi");
  const [payState, setPayState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addrId, setAddrId] = useState("");
  const [addrForm, setAddrForm] = useState({ label: "Home", line: "", city: "", pin: "", phone: "" });
  const [addrEditing, setAddrEditing] = useState(null);
  const [showAddrForm, setShowAddrForm] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get("/cart").then((r) => setItems(r.data.items));
  const loadAddresses = () => api.get("/users/me/addresses").then((r) => {
    setAddresses(r.data);
    if (r.data.length && !addrId) setAddrId((r.data.find((a) => a.is_default) || r.data[0]).id);
  }).catch(() => {});

  const setDefaultAddr = async (id) => {
    await api.post(`/users/me/addresses/${id}/default`);
    setAddrId(id);
    loadAddresses();
  };
  useEffect(() => {
    load();
    loadAddresses();
    api.get("/recently-viewed").then((r) => setRecent(r.data.items)).catch(() => {});
  }, []);

  const saveAddress = async () => {
    if (!addrForm.line || !addrForm.city || !addrForm.pin) return toast.error("Line, city and PIN are required");
    try {
      if (addrEditing) {
        await api.put(`/users/me/addresses/${addrEditing}`, addrForm);
      } else {
        const { data } = await api.post("/users/me/addresses", addrForm);
        setAddrId(data.id);
      }
      toast.success("Address saved");
      setShowAddrForm(false);
      setAddrEditing(null);
      setAddrForm({ label: "Home", line: "", city: "", pin: "", phone: "" });
      loadAddresses();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const delAddress = async (id) => {
    await api.delete(`/users/me/addresses/${id}`);
    if (addrId === id) setAddrId("");
    loadAddresses();
  };

  const setQty = async (pid, qty) => {
    await api.put(`/cart/${pid}`, { qty });
    load();
  };

  const remove = async (pid) => {
    await api.delete(`/cart/${pid}`);
    load();
  };

  const toggleSaved = async (pid) => {
    const { data } = await api.put(`/cart/${pid}/save-for-later`);
    toast.success(data.saved ? "Saved for later" : "Moved to cart");
    load();
  };

  const active = items.filter((i) => !i.saved);
  const savedLater = items.filter((i) => i.saved);
  const fees = calcBreakdown(active);

  const checkout = async () => {
    if (!addrId && !address) return toast.error("Select or enter a delivery address");
    setBusy(true);
    try {
      const { data } = await api.post("/orders/checkout", { payment_method: method, address_id: addrId, address });
      const po = await api.post("/payments/create", { amount: data.order.total, purpose: "order", ref_id: data.order.id });
      if (po.data.razorpay) {
        await loadRazorpay();
        const rzp = new window.Razorpay({
          key: po.data.key_id,
          order_id: po.data.order_id,
          amount: Math.round(data.order.total * 100),
          currency: "INR",
          name: "Sketch",
          description: "Order payment",
          theme: { color: "#E63946" },
          handler: async (resp) => {
            try {
              const verified = await api.post("/payments/verify", {
                order_id: po.data.order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                method,
              });
              await api.post(`/orders/${data.order.id}/pay`, { payment_db_id: verified.data.id });
              toast.success("Payment successful — order placed (escrow)");
              navigate("/orders");
            } catch (e) {
              toast.error(fmtErr(e));
            }
          },
        });
        rzp.open();
      } else {
        setPayState({ order: data.order, paymentOrder: po.data });
      }
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPay = async () => {
    setBusy(true);
    try {
      const verified = await api.post("/payments/verify", { order_id: payState.paymentOrder.order_id, method });
      await api.post(`/orders/${payState.order.id}/pay`, { payment_db_id: verified.data.id });
      toast.success("Payment successful — order placed (escrow)");
      setPayState(null);
      navigate("/orders");
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="cart-page">
      <PageHeader kicker="Checkout" title="Your cart." />
      {!items.length ? (
        <EmptyState testid="cart-empty" title="Your cart is empty" hint="Discover artwork and supplies in the marketplace." />
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-12">
          <div className="space-y-4">
            {!active.length && (
              <EmptyState testid="cart-active-empty" title="No items ready to checkout" hint="Move saved items back to cart to buy them." />
            )}
            {active.map((it) => (
              <CartRow key={`active-${it.id}`} it={it} onQty={setQty} onRemove={remove} onToggleSaved={toggleSaved} navigate={navigate} />
            ))}
            {savedLater.length > 0 && (
              <div className="pt-8" data-testid="saved-for-later">
                <p className="font-meta text-[10px] text-muted-foreground mb-4">Saved for later — {savedLater.length}</p>
                <div className="space-y-4">
                  {savedLater.map((it) => (
                    <CartRow key={`saved-${it.id}`} it={it} onQty={setQty} onRemove={remove} onToggleSaved={toggleSaved} navigate={navigate} saved />
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="border border-border/60 p-6 h-fit space-y-4" data-testid="cart-summary">
            <p className="font-display font-bold text-lg">Order summary</p>
            <Row label="Subtotal" value={inr(fees.subtotal)} />
            <Row label="Tax (GST 5%)" value={inr(fees.tax)} />
            <Row label="Shipping" value={fees.shipping ? inr(fees.shipping) : "Free"} />
            <Row label="Packaging" value={fees.packaging ? inr(fees.packaging) : "—"} />
            <div className="border-t border-border/60 pt-3 flex justify-between font-display font-bold text-lg">
              <span>Total</span>
              <span data-testid="cart-total">{inr(fees.total)}</span>
            </div>
            <div>
              <Label className="font-meta text-[10px]">Delivery address</Label>
              <div className="mt-2 space-y-2" data-testid="address-book">
                {addresses.map((a) => (
                  <div key={a.id} data-testid={`address-${a.id}`}
                    onClick={() => setAddrId(a.id)}
                    className={`border p-3 cursor-pointer transition-colors ${addrId === a.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-foreground/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display font-bold text-sm flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" /> {a.label}
                      </p>
                      <div className="flex gap-2 items-center">
                        <button data-testid={`default-address-${a.id}`} onClick={(e) => { e.stopPropagation(); setDefaultAddr(a.id); }}
                          title="Set as default" className={`transition-colors ${a.is_default ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}`}>
                          <Star className={`h-3.5 w-3.5 ${a.is_default ? "fill-amber-400" : ""}`} />
                        </button>
                        <button data-testid={`edit-address-${a.id}`} onClick={(e) => { e.stopPropagation(); setAddrForm(a); setAddrEditing(a.id); setShowAddrForm(true); }}
                          className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button data-testid={`delete-address-${a.id}`} onClick={(e) => { e.stopPropagation(); delAddress(a.id); }}
                          className="text-muted-foreground hover:text-primary transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{a.line}, {a.city} — {a.pin}</p>
                  </div>
                ))}
                {showAddrForm ? (
                  <div className="border border-border/60 p-3 space-y-2" data-testid="address-form">
                    <div className="grid grid-cols-2 gap-2">
                      <Input data-testid="addr-label" placeholder="Label (Home/Work)" className="rounded-none" value={addrForm.label}
                        onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })} />
                      <Input data-testid="addr-phone" placeholder="Phone" className="rounded-none" value={addrForm.phone}
                        onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} />
                    </div>
                    <Input data-testid="addr-line" placeholder="Street address" className="rounded-none" value={addrForm.line}
                      onChange={(e) => setAddrForm({ ...addrForm, line: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input data-testid="addr-city" placeholder="City" className="rounded-none" value={addrForm.city}
                        onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} />
                      <Input data-testid="addr-pin" placeholder="PIN code" className="rounded-none" value={addrForm.pin}
                        onChange={(e) => setAddrForm({ ...addrForm, pin: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button data-testid="addr-save" onClick={saveAddress} className="rounded-none font-meta text-[9px] h-9">
                        {addrEditing ? "Update" : "Save address"}
                      </Button>
                      <Button variant="outline" data-testid="addr-cancel" onClick={() => { setShowAddrForm(false); setAddrEditing(null); }}
                        className="rounded-none font-meta text-[9px] h-9">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button data-testid="add-address-btn"
                    onClick={() => { setAddrEditing(null); setAddrForm({ label: "Home", line: "", city: "", pin: "", phone: "" }); setShowAddrForm(true); }}
                    className="w-full border border-dashed border-border p-3 font-meta text-[9px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                    + Add new address
                  </button>
                )}
                {!addresses.length && !showAddrForm && (
                  <Input data-testid="checkout-address" className="rounded-none" placeholder="Or type a one-time address: street, city, PIN"
                    value={address} onChange={(e) => setAddress(e.target.value)} />
                )}
              </div>
            </div>
            <div>
              <Label className="font-meta text-[10px]">Payment method</Label>
              <RadioGroup value={method} onValueChange={setMethod} className="mt-2 space-y-2">
                {METHODS.map((m) => (
                  <label key={m.value} className="flex items-center gap-3 border border-border/60 px-3 py-2 cursor-pointer hover:border-foreground/40 transition-colors">
                    <RadioGroupItem value={m.value} data-testid={`pay-method-${m.value}`} />
                    <span className="text-sm">{m.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <Button data-testid="checkout-pay-btn" onClick={checkout} disabled={busy || !active.length} className="w-full rounded-none font-meta text-[11px] h-12">
              {busy ? "Processing..." : `Pay ${inr(fees.total)}`}
            </Button>
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Payments held in escrow until delivery.
            </p>
            <p className="text-[11px] text-muted-foreground" data-testid="no-refund-note">
              All sales are final — Sketch does not offer refunds. Disputes are resolved via support.
            </p>
          </aside>
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-16" data-testid="recently-viewed">
          <p className="font-meta text-[11px] text-muted-foreground mb-5">Recently viewed</p>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4">
            {recent.map((p) => (
              <div key={`recent-${p.id}`} className="w-56 shrink-0">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={!!payState} onOpenChange={() => setPayState(null)}>
        <DialogContent className="rounded-none max-w-sm" data-testid="payment-gateway-modal">
          <DialogHeader>
            <DialogTitle className="font-display">Sketch Pay — Demo Gateway</DialogTitle>
            <DialogDescription className="sr-only">Confirm your demo payment to place the order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border border-border/60 p-4">
              <p className="font-meta text-[9px] text-muted-foreground">Amount payable</p>
              <p className="font-display text-3xl font-black mt-1" data-testid="gateway-amount">{inr(payState?.order.total)}</p>
              <p className="font-meta text-[9px] text-muted-foreground mt-2">via {method.toUpperCase()} · order {payState?.paymentOrder.order_id}</p>
            </div>
            <Button data-testid="gateway-confirm-btn" onClick={confirmPay} disabled={busy} className="w-full rounded-none font-meta text-[11px] h-11">
              {busy ? "Verifying..." : "Confirm payment"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Demo gateway — no real charge. Funds move to escrow and release on delivery.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(s);
  });
}

function CartRow({ it, onQty, onRemove, onToggleSaved, navigate, saved }) {
  return (
    <div className="flex gap-4 border border-border/60 p-4" data-testid={`cart-item-${it.id}`}>
      <img src={fileUrl(it.images?.[0])} alt={it.title} className="h-24 w-20 object-cover cursor-pointer"
        onClick={() => navigate(`/product/${it.id}`)} />
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold">{it.title}</p>
        <p className="text-xs text-muted-foreground">{it.seller_name}</p>
        <p className="font-meta text-xs mt-2">
          {inr(it.final_price ?? it.price)}
          {it.discount_pct > 0 && <span className="text-muted-foreground line-through ml-2">{inr(it.price)}</span>}
          {it.variation && <span className="text-muted-foreground ml-2">· {it.variation}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {!saved && (
            <>
              <button data-testid={`qty-minus-${it.id}`} onClick={() => onQty(it.id, it.qty - 1)} className="h-7 w-7 border border-border/60 flex items-center justify-center hover:border-foreground/40">
                <Minus className="h-3 w-3" />
              </button>
              <span className="font-meta text-xs w-6 text-center">{it.qty}</span>
              <button data-testid={`qty-plus-${it.id}`} onClick={() => onQty(it.id, it.qty + 1)} className="h-7 w-7 border border-border/60 flex items-center justify-center hover:border-foreground/40">
                <Plus className="h-3 w-3" />
              </button>
            </>
          )}
          <button data-testid={`save-later-${it.id}`} onClick={() => onToggleSaved(it.id)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-2">
            {saved ? <ArrowUpToLine className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            {saved ? "Move to cart" : "Save for later"}
          </button>
          <button data-testid={`remove-${it.id}`} onClick={() => onRemove(it.id)} className="ml-auto text-muted-foreground hover:text-primary transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
