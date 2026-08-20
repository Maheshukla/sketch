import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, MessageSquare, Truck } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge, WhatsAppButton } from "@/components/cards";

const SELLER_ROLES = ["artist", "retailer", "company_owner", "company_admin", "company_artist"];
const DISPUTABLE = ["placed", "accepted", "processing", "shipped", "out_for_delivery", "delivered"];

export default function OrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/orders/${id}`).then((r) => setOrder(r.data)).catch(() => setError(true));
  }, [id]);

  const openChat = async () => {
    try {
      const { data } = await api.post("/chat/threads", { kind: "order", order_id: order.id });
      navigate(`/chat?thread=${data.id}`);
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const submitDispute = async () => {
    if (!disputeReason.trim()) return toast.error("Describe the issue");
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/dispute`, { reason: disputeReason });
      toast.success("Dispute raised — our team will review it");
      setDisputeOpen(false);
      setDisputeReason("");
      const { data } = await api.get(`/orders/${order.id}`);
      setOrder(data);
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-[900px] mx-auto px-4 sm:px-8 py-24 text-center" data-testid="order-detail-error">
        <p className="font-display text-2xl font-bold">Order unavailable</p>
        <p className="text-muted-foreground text-sm mt-2">This order doesn't exist or isn't accessible to you.</p>
        <Button data-testid="order-back" onClick={() => navigate("/orders")} className="rounded-none font-meta text-[10px] mt-6">Back to orders</Button>
      </div>
    );
  }
  if (!order) return <div className="min-h-screen" />;

  const isSeller = SELLER_ROLES.includes(user?.role) && order.items.some((i) => i.seller_id === user?.id || i.seller_id === user?.company_id);
  const addr = order.address_snapshot || {};
  const s = order.shipping || {};

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-8 py-12" data-testid="order-detail-page">
      <button onClick={() => navigate("/orders")} className="flex items-center gap-2 font-meta text-[10px] text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to orders
      </button>
      <PageHeader kicker={`Order #${order.id.slice(-8)}`} title="Order details."
        sub={new Date(order.created_at).toLocaleString("en-IN")} />

      <div className="flex flex-wrap gap-3 mb-8">
        <StatusBadge status={order.status} />
        <StatusBadge status={order.payment_status || "pending"} />
        {order.payment && <StatusBadge status={order.payment.escrow} />}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-8">
        <Button data-testid="order-chat-btn" variant="outline" onClick={openChat} className="rounded-none font-meta text-[10px]">
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> {isSeller ? "Chat with buyer" : "Chat with seller"}
        </Button>
        {!isSeller && DISPUTABLE.includes(order.status) && (
          <Button data-testid="order-dispute-btn" variant="outline" onClick={() => setDisputeOpen(true)}
            className="rounded-none font-meta text-[10px] text-primary border-primary/40">Raise dispute</Button>
        )}
        {order.dispute && (
          <p className="w-full text-xs text-muted-foreground border-l-2 border-primary pl-3 mt-2" data-testid="order-dispute-info">
            Dispute ({order.dispute.status}): {order.dispute.reason}
            {order.dispute.resolution && ` — resolved: ${order.dispute.resolution}${order.dispute.note ? ` (${order.dispute.note})` : ""}`}
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6">
          <section className="border border-border/60" data-testid="order-items">
            <p className="font-meta text-[10px] text-muted-foreground px-5 py-3 border-b border-border/60">Items</p>
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/40 last:border-0">
                <img src={fileUrl(it.image)} alt="" className="h-14 w-14 object-cover cursor-pointer"
                  onClick={() => navigate(`/product/${it.product_id}`)} />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm truncate">{it.title}{it.variation ? ` (${it.variation})` : ""}</p>
                  <p className="text-xs text-muted-foreground">{it.seller_name} · qty {it.qty}</p>
                </div>
                <p className="font-meta text-xs">{inr(it.price * it.qty)}</p>
              </div>
            ))}
          </section>

          {order.timeline?.length > 0 && (
            <section className="border border-border/60 p-5" data-testid="order-timeline">
              <p className="font-meta text-[10px] text-muted-foreground mb-4">Timeline</p>
              <div className="space-y-3">
                {order.timeline.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="h-2 w-2 bg-primary shrink-0" />
                    <span className="text-sm flex-1">{t.label}</span>
                    <span className="font-meta text-[9px] text-muted-foreground">{new Date(t.at).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="border border-border/60 p-5" data-testid="order-address">
            <p className="font-meta text-[10px] text-muted-foreground mb-3 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" /> Delivery address
            </p>
            {addr.house ? (
              <div className="text-sm space-y-0.5">
                <p className="font-display font-bold">{addr.full_name} · +91 {addr.mobile}</p>
                <p className="text-muted-foreground">{addr.house}, {addr.area}{addr.landmark ? `, ${addr.landmark}` : ""}</p>
                <p className="text-muted-foreground">{addr.city}, {addr.state} — {addr.pin}, {addr.country || "India"}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{order.address}</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-border/60 p-5" data-testid="order-summary-detail">
            <p className="font-meta text-[10px] text-muted-foreground mb-4">Summary</p>
            <Row label="Subtotal" value={inr(order.subtotal)} />
            <Row label="Tax (GST)" value={inr(order.tax)} />
            <Row label="Shipping" value={order.shipping ? inr(order.shipping) : "Free"} />
            <Row label="Packaging" value={order.packaging ? inr(order.packaging) : "—"} />
            <div className="border-t border-border/60 mt-3 pt-3 flex justify-between font-display font-bold">
              <span>Total</span><span data-testid="order-total">{inr(order.total)}</span>
            </div>
            <p className="font-meta text-[9px] text-muted-foreground mt-3">Paid via {(order.payment_method || "").toUpperCase()} · {order.payment?.payment_id || "pending"}</p>
          </section>

          {(s.provider || order.courier) && (
            <section className="border border-border/60 p-5" data-testid="order-shipping">
              <p className="font-meta text-[10px] text-muted-foreground mb-3 flex items-center gap-2">
                <Truck className="h-3.5 w-3.5" /> Shipping
              </p>
              <Row label="Provider" value={s.provider || order.courier} />
              <Row label="Shipment" value={s.shipment_id || "—"} />
              <Row label="Tracking" value={s.tracking_number || order.tracking_id || "—"} />
              <Row label="Pickup" value={s.pickup_status || "—"} />
              <Row label="Charge" value={s.shipping_charge ? inr(s.shipping_charge) : "—"} />
              {s.tracking_url && (
                <a data-testid="tracking-url" href={s.tracking_url} target="_blank" rel="noreferrer"
                  className="font-meta text-[10px] text-primary hover:underline mt-3 inline-block">Track shipment →</a>
              )}
            </section>
          )}

          <WhatsAppButton reference={`order #${order.id.slice(-8)}`} testid="order-whatsapp" />
        </aside>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="rounded-none max-w-md" data-testid="dispute-modal">
          <DialogHeader>
            <DialogTitle className="font-display">Raise a dispute</DialogTitle>
            <DialogDescription className="text-sm">Your payment stays in escrow while our team reviews. All sales are final unless a dispute is resolved in your favour.</DialogDescription>
          </DialogHeader>
          <Textarea data-testid="dispute-reason" className="rounded-none" rows={4} placeholder="Describe the issue (item not received, damaged, not as described...)"
            value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} />
          <Button data-testid="dispute-submit" onClick={submitDispute} disabled={busy} className="rounded-none font-meta text-[10px] h-11">
            {busy ? "Submitting..." : "Submit dispute"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
