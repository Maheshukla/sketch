import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, EmptyState, StatusBadge, WhatsAppButton } from "@/components/cards";

const SELLER_ROLES = ["artist", "retailer", "company_owner", "company_admin", "company_artist"];
const STEPS = ["placed", "accepted", "processing", "shipped", "out_for_delivery", "delivered", "completed"];

export default function OrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [sales, setSales] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [ship, setShip] = useState({});
  const isSeller = SELLER_ROLES.includes(user?.role);

  const load = () => {
    api.get("/orders").then((r) => setOrders(r.data));
    if (isSeller) api.get("/orders/seller").then((r) => setSales(r.data));
    api.get("/couriers").then((r) => setCouriers(r.data));
  };
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id, action, extra = {}) => {
    try {
      await api.post(`/orders/${id}/status`, { action, ...extra });
      toast.success(`Order ${extra.action || action}`);
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const doShip = async (id) => {
    const s = ship[id] || {};
    if (!s.courier) return toast.error("Select a courier partner");
    setStatus(id, "shipped", { courier: s.courier, tracking_id: s.tracking_id || "" });
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="orders-page">
      <PageHeader kicker="Orders" title="Track everything." />
      <Tabs defaultValue="purchases">
        <TabsList className="rounded-none mb-8">
          <TabsTrigger value="purchases" data-testid="tab-purchases" className="rounded-none font-meta text-[10px]">My purchases</TabsTrigger>
          {isSeller && <TabsTrigger value="sales" data-testid="tab-sales" className="rounded-none font-meta text-[10px]">Sales to fulfil</TabsTrigger>}
        </TabsList>

        <TabsContent value="purchases">
          {!orders.length ? (
            <EmptyState testid="orders-empty" title="No orders yet" hint="Your purchases will appear here." />
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="card-lift border border-border/60 p-5 cursor-pointer" data-testid={`order-${o.id}`}
                  onClick={() => navigate(`/orders/${o.id}`)}>
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div>
                      <p className="font-meta text-[9px] text-muted-foreground">Order #{o.id.slice(-8)} · {new Date(o.created_at).toLocaleDateString()}</p>
                      <p className="font-display font-bold mt-1">{inr(o.total)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.status !== "cancelled" && (
                    <div className="flex gap-1.5 mt-4" data-testid={`order-steps-${o.id}`}>
                      {STEPS.map((s) => (
                        <div key={s} className={`h-1 flex-1 transition-colors ${STEPS.indexOf(o.status) >= STEPS.indexOf(s) ? "bg-primary" : "bg-secondary"}`} />
                      ))}
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    {o.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <img src={fileUrl(it.image)} alt="" className="h-10 w-10 object-cover" />
                        <span className="flex-1 truncate">{it.title}{it.variation ? ` (${it.variation})` : ""} × {it.qty}</span>
                        <span className="font-meta text-xs">{inr(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>
                  {o.courier && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground mt-4" data-testid={`courier-info-${o.id}`}>
                      <Truck className="h-3.5 w-3.5" /> {o.courier} {o.tracking_id && `· ${o.tracking_id}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4 items-center" onClick={(e) => e.stopPropagation()}>
                    {o.status === "shipped" && (
                      <Button data-testid={`confirm-delivery-${o.id}`} onClick={() => setStatus(o.id, "delivered")}
                        className="rounded-none font-meta text-[10px]">Confirm delivery</Button>
                    )}
                    {o.status === "out_for_delivery" && (
                      <Button data-testid={`confirm-delivery-${o.id}`} onClick={() => setStatus(o.id, "delivered")}
                        className="rounded-none font-meta text-[10px]">Confirm delivery</Button>
                    )}
                    {o.status === "delivered" && (
                      <Button data-testid={`complete-order-${o.id}`} onClick={() => setStatus(o.id, "completed")} variant="outline"
                        className="rounded-none font-meta text-[10px]">Mark completed</Button>
                    )}
                    <WhatsAppButton reference={`order #${o.id.slice(-8)}`} testid={`order-help-${o.id}`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {isSeller && (
          <TabsContent value="sales">
            {!sales.length ? (
              <EmptyState testid="sales-empty" title="No sales yet" hint="Orders from customers will appear here." />
            ) : (
              <div className="space-y-4">
                {sales.map((o) => (
                  <div key={o.id} className="card-lift border border-border/60 p-5" data-testid={`sale-${o.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-display font-bold">{o.buyer_name}</p>
                        <p className="font-meta text-[9px] text-muted-foreground mt-1">{new Date(o.created_at).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {o.items.map((it, i) => (
                        <p key={i} className="text-sm text-muted-foreground">
                          {it.title}{it.variation ? ` (${it.variation})` : ""} × {it.qty} — <span className="font-meta text-xs text-foreground">{inr(it.price * it.qty)}</span>
                        </p>
                      ))}
                    </div>

                    {o.status === "placed" && (
                      <div className="flex gap-2 mt-4">
                        <Button data-testid={`accept-order-${o.id}`} onClick={() => setStatus(o.id, "accept")}
                          className="rounded-none font-meta text-[10px]">
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Accept order
                        </Button>
                        <Button data-testid={`reject-order-${o.id}`} onClick={() => setStatus(o.id, "reject")} variant="outline"
                          className="rounded-none font-meta text-[10px] text-primary border-primary/40 hover:bg-primary/10">
                          <X className="h-3.5 w-3.5 mr-1.5" /> Reject (refund)
                        </Button>
                      </div>
                    )}

                    {o.status === "accepted" && (
                      <Button data-testid={`processing-order-${o.id}`} onClick={() => setStatus(o.id, "processing")} variant="outline"
                        className="rounded-none font-meta text-[10px] mt-4">Start processing</Button>
                    )}

                    {["accepted", "processing"].includes(o.status) && (
                      <div className="flex flex-wrap gap-2 mt-4">                        <Select value={ship[o.id]?.courier || ""} onValueChange={(v) => setShip({ ...ship, [o.id]: { ...ship[o.id], courier: v } })}>
                          <SelectTrigger data-testid={`ship-courier-${o.id}`} className="rounded-none w-48">
                            <SelectValue placeholder="Courier partner" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {couriers.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input data-testid={`ship-tracking-${o.id}`} placeholder="Tracking ID (optional)" className="rounded-none w-56"
                          value={ship[o.id]?.tracking_id || ""}
                          onChange={(e) => setShip({ ...ship, [o.id]: { ...ship[o.id], tracking_id: e.target.value } })} />
                        <Button data-testid={`ship-btn-${o.id}`} onClick={() => doShip(o.id)} className="rounded-none font-meta text-[10px]">Mark shipped</Button>
                      </div>
                    )}
                    {o.status === "shipped" && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button data-testid={`pickedup-btn-${o.id}`} onClick={() => setStatus(o.id, "picked_up")} variant="outline"
                          className="rounded-none font-meta text-[10px]">Courier picked up</Button>
                        <Button data-testid={`ofd-btn-${o.id}`} onClick={() => setStatus(o.id, "out_for_delivery")} variant="outline"
                          className="rounded-none font-meta text-[10px]">Out for delivery</Button>
                      </div>
                    )}
                    {o.courier && ["shipped", "out_for_delivery", "delivered", "completed"].includes(o.status) && (
                      <p className="text-xs text-muted-foreground mt-3">Shipped via {o.courier} {o.tracking_id && `· ${o.tracking_id}`}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
