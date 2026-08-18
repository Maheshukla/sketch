import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { fmtErr, inr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState, StatusBadge } from "@/components/cards";

const FLOW = ["submitted", "under_review", "sent_to_creator", "estimated", "approved", "paid", "in_progress", "delivered", "completed"];

export default function CustomOrdersPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);

  const load = () => api.get("/custom-requests").then((r) => setRequests(r.data));
  useEffect(() => {
    load();
  }, []);

  const mine = requests.filter((r) => r.customer_id === user?.id);
  const incoming = requests.filter((r) => r.customer_id !== user?.id);
  const isStaff = ["super_admin", "admin", "support"].includes(user?.role);
  const canReceive = ["artist", "company_owner", "company_admin", "company_artist"].includes(user?.role);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="custom-orders-page">
      <PageHeader kicker="Commissions" title="Custom orders."
        sub="From brief to delivery — estimates, advance payments and escrow, all in one thread." />
      <Tabs defaultValue="mine">
        <TabsList className="rounded-none mb-8">
          <TabsTrigger value="mine" data-testid="tab-my-requests" className="rounded-none font-meta text-[10px]">My requests</TabsTrigger>
          {(canReceive || isStaff) && (
            <TabsTrigger value="incoming" data-testid="tab-incoming-requests" className="rounded-none font-meta text-[10px]">
              {isStaff ? "All requests" : "Incoming"}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="mine">
          <RequestList list={mine} user={user} reload={load} empty="No custom requests yet" hint="Commission an artist from their profile or a reel." />
        </TabsContent>
        {(canReceive || isStaff) && (
          <TabsContent value="incoming">
            <RequestList list={isStaff ? requests : incoming} user={user} reload={load} empty="No incoming requests" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function RequestList({ list, user, reload, empty, hint }) {
  if (!list.length) return <EmptyState testid="requests-empty" title={empty} hint={hint} />;
  return (
    <div className="space-y-4">
      {list.map((r) => (
        <RequestCard key={r.id} req={r} user={user} reload={reload} />
      ))}
    </div>
  );
}

function RequestCard({ req, user, reload }) {
  const [estimate, setEstimate] = useState({ cost: "", deadline: "", message: "" });
  const [delivery, setDelivery] = useState({ note: "", images: "" });
  const [assignTo, setAssignTo] = useState("");
  const [members, setMembers] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payInfo, setPayInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const isCustomer = req.customer_id === user.id;
  const isStaff = ["super_admin", "admin"].includes(user.role);
  const isCompanyManager = ["company_owner", "company_admin"].includes(user.role) && req.target_type === "company";
  const isCreatorSide = !isCustomer && (isCompanyManager || (req.target_type === "user" && req.target_id === user.id) || String(req.assigned_to) === user.id);

  useEffect(() => {
    if (isCompanyManager) api.get(`/companies/${req.target_id}`).then((r) => setMembers(r.data.members || [])).catch(() => {});
  }, [isCompanyManager, req.target_id]);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
      reload();
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const stepIdx = FLOW.indexOf(req.status);
  const payable = req.estimate ? (req.payment_type === "advance" ? Math.round(req.estimate.cost * 0.3) : req.estimate.cost) : 0;

  const startPayment = () =>
    act(async () => {
      const po = await api.post("/payments/create", { amount: payable, purpose: "custom", ref_id: req.id });
      setPayInfo(po.data);
      setPayOpen(true);
    });

  const confirmPay = () =>
    act(async () => {
      const verified = await api.post("/payments/verify", { order_id: payInfo.order_id, method: "upi" });
      await api.post(`/custom-requests/${req.id}/pay`, { payment_db_id: verified.data.id });
      setPayOpen(false);
    }, "Payment held in escrow");

  return (
    <div className="border border-border/60 p-6" data-testid={`cr-card-${req.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-xl font-bold">{req.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isCustomer ? `To: ${req.target_name}` : `From: ${req.customer_name}`} · {new Date(req.created_at).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {req.description && <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{req.description}</p>}
      {req.budget > 0 && <p className="font-meta text-[10px] mt-2">Budget: {inr(req.budget)}</p>}

      <div className="flex gap-1.5 mt-5 flex-wrap" data-testid={`cr-timeline-${req.id}`}>
        {FLOW.map((s, i) => (
          <span key={s} className={`font-meta text-[8px] px-2 py-1 border ${i <= stepIdx ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}>
            {s.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {req.estimate && (
        <div className="mt-5 border border-border/60 p-4 bg-secondary/40" data-testid={`cr-estimate-${req.id}`}>
          <p className="font-meta text-[9px] text-muted-foreground">Estimate from {req.estimate.by}</p>
          <p className="font-display text-2xl font-black mt-1">{inr(req.estimate.cost)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Deadline: {req.estimate.deadline || "TBD"} {req.estimate.message && `· ${req.estimate.message}`}
          </p>
        </div>
      )}

      {isStaff && ["submitted", "under_review"].includes(req.status) && (
        <div className="flex gap-2 mt-5">
          <Button data-testid={`cr-approve-${req.id}`} disabled={busy} onClick={() => act(() => api.post(`/custom-requests/${req.id}/review`, { approve: true }), "Sent to creator")}
            className="rounded-none font-meta text-[10px]">Approve & forward</Button>
          <Button data-testid={`cr-reject-${req.id}`} disabled={busy} variant="outline" onClick={() => act(() => api.post(`/custom-requests/${req.id}/review`, { approve: false }), "Declined")}
            className="rounded-none font-meta text-[10px]">Decline</Button>
        </div>
      )}

      {isCreatorSide && req.status === "sent_to_creator" && (
        <div className="mt-5 grid sm:grid-cols-[140px_160px_1fr_auto] gap-2 items-end">
          <div>
            <Label className="font-meta text-[9px]">Cost (₹)</Label>
            <Input data-testid={`cr-est-cost-${req.id}`} type="number" className="rounded-none mt-1" value={estimate.cost}
              onChange={(e) => setEstimate({ ...estimate, cost: e.target.value })} />
          </div>
          <div>
            <Label className="font-meta text-[9px]">Deadline</Label>
            <Input data-testid={`cr-est-deadline-${req.id}`} type="date" className="rounded-none mt-1" value={estimate.deadline}
              onChange={(e) => setEstimate({ ...estimate, deadline: e.target.value })} />
          </div>
          <div>
            <Label className="font-meta text-[9px]">Note</Label>
            <Input data-testid={`cr-est-msg-${req.id}`} className="rounded-none mt-1" value={estimate.message}
              onChange={(e) => setEstimate({ ...estimate, message: e.target.value })} />
          </div>
          <Button data-testid={`cr-est-submit-${req.id}`} disabled={busy || !estimate.cost}
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/estimate`, { cost: parseFloat(estimate.cost), deadline: estimate.deadline, message: estimate.message }), "Estimate sent")}
            className="rounded-none font-meta text-[10px]">Send estimate</Button>
        </div>
      )}

      {isCustomer && req.status === "estimated" && (
        <div className="flex flex-wrap gap-2 mt-5">
          <Button data-testid={`cr-accept-full-${req.id}`} disabled={busy}
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/respond`, { accept: true, payment_type: "full" }), "Proposal accepted — full payment")}
            className="rounded-none font-meta text-[10px]">Accept · pay full</Button>
          <Button data-testid={`cr-accept-advance-${req.id}`} disabled={busy} variant="outline"
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/respond`, { accept: true, payment_type: "advance" }), "Proposal accepted — 30% advance")}
            className="rounded-none font-meta text-[10px]">Accept · pay 30% advance</Button>
          <Button data-testid={`cr-decline-${req.id}`} disabled={busy} variant="ghost"
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/respond`, { accept: false }), "Declined")}
            className="rounded-none font-meta text-[10px]">Decline</Button>
        </div>
      )}

      {isCustomer && req.status === "approved" && (
        <Button data-testid={`cr-pay-${req.id}`} disabled={busy} onClick={startPayment} className="rounded-none font-meta text-[10px] mt-5">
          Pay {inr(payable)} ({req.payment_type === "advance" ? "advance" : "full"})
        </Button>
      )}

      {isCompanyManager && req.status === "paid" && (
        <div className="flex gap-2 mt-5">
          <Select value={assignTo} onValueChange={setAssignTo}>
            <SelectTrigger data-testid={`cr-assign-select-${req.id}`} className="rounded-none w-56">
              <SelectValue placeholder="Assign to artist" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {members.filter((m) => m.role === "artist").map((m) => (
                <SelectItem key={m.email} value={String(m.user_id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button data-testid={`cr-assign-btn-${req.id}`} disabled={busy || !assignTo}
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/assign`, { artist_id: assignTo }), "Artist assigned")}
            className="rounded-none font-meta text-[10px]">Assign</Button>
        </div>
      )}

      {isCreatorSide && req.status === "paid" && (!req.assigned_to || String(req.assigned_to) === user.id || isCompanyManager) && (
        <Button data-testid={`cr-start-${req.id}`} disabled={busy} variant="outline"
          onClick={() => act(() => api.post(`/custom-requests/${req.id}/start`), "Work started")}
          className="rounded-none font-meta text-[10px] mt-5">Start work</Button>
      )}

      {isCreatorSide && req.status === "in_progress" && (String(req.assigned_to) === user.id || isCompanyManager || (req.target_type === "user" && req.target_id === user.id)) && (
        <div className="mt-5 space-y-2">
          <Textarea data-testid={`cr-delivery-note-${req.id}`} className="rounded-none" placeholder="Delivery note for the customer..."
            value={delivery.note} onChange={(e) => setDelivery({ ...delivery, note: e.target.value })} />
          <Input data-testid={`cr-delivery-images-${req.id}`} className="rounded-none" placeholder="Delivery image URLs (comma separated, optional)"
            value={delivery.images} onChange={(e) => setDelivery({ ...delivery, images: e.target.value })} />
          <Button data-testid={`cr-deliver-${req.id}`} disabled={busy}
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/deliver`, { note: delivery.note, delivery_images: delivery.images.split(",").map((s) => s.trim()).filter(Boolean) }), "Delivered for review")}
            className="rounded-none font-meta text-[10px]">Deliver final work</Button>
        </div>
      )}

      {isCustomer && req.status === "delivered" && (
        <div className="mt-5">
          {req.delivery_note && <p className="text-sm border-l-2 border-primary pl-3 mb-3">{req.delivery_note}</p>}
          {req.delivery_images?.map((img, i) => (
            <img key={i} src={img} alt="" className="h-32 inline-block mr-2 mb-2 border border-border/60 object-cover" />
          ))}
          <Button data-testid={`cr-complete-${req.id}`} disabled={busy}
            onClick={() => act(() => api.post(`/custom-requests/${req.id}/complete`), "Order completed — escrow released")}
            className="rounded-none font-meta text-[10px] block">Approve & complete order</Button>
        </div>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="rounded-none max-w-sm" data-testid="cr-payment-modal">
          <DialogHeader>
            <DialogTitle className="font-display">Sketch Pay — Demo Gateway</DialogTitle>
            <DialogDescription className="sr-only">Confirm your demo payment for this custom order</DialogDescription>
          </DialogHeader>
          <p className="font-display text-3xl font-black" data-testid="cr-gateway-amount">{inr(payable)}</p>
          <p className="font-meta text-[9px] text-muted-foreground">{req.payment_type} payment · held in escrow until completion</p>
          <Button data-testid="cr-gateway-confirm" onClick={confirmPay} disabled={busy} className="w-full rounded-none font-meta text-[11px] h-11">
            Confirm payment
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
