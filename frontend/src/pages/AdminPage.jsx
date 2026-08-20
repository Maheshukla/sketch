import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatCard, EmptyState, StatusBadge } from "@/components/cards";

export default function AdminPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState("");
  const [queue, setQueue] = useState([]);
  const [queueType, setQueueType] = useState("reels");
  const [reports, setReports] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [verifs, setVerifs] = useState([]);
  const [kycFilter, setKycFilter] = useState("");
  const [kycNote, setKycNote] = useState({});
  const [kycDetail, setKycDetail] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [disputeNote, setDisputeNote] = useState({});
  const [payments, setPayments] = useState([]);
  const [reportDetail, setReportDetail] = useState(null);
  const [reportNote, setReportNote] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [reply, setReply] = useState({});
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "", role: "admin" });
  const [newCat, setNewCat] = useState({ name: "", subcategories: "" });

  const loadOverview = () => api.get("/admin/overview").then((r) => setOverview(r.data));
  const loadUsers = (q = "") => api.get("/admin/users", { params: { q } }).then((r) => setUsers(r.data));
  const loadQueue = (t = queueType) => api.get("/admin/moderation", { params: { type: t } }).then((r) => setQueue(r.data));
  const loadReports = () => api.get("/admin/reports").then((r) => setReports(r.data));
  const loadTickets = () => api.get("/tickets").then((r) => setTickets(r.data));

  const loadVerifs = (status = "") =>
    api.get("/admin/verifications", { params: status ? { status } : {} }).then((r) => setVerifs(r.data));
  const openKycDetail = (vid) =>
    api.get(`/admin/verifications/${vid}`).then((r) => setKycDetail(r.data)).catch((e) => toast.error(fmtErr(e)));
  const loadRetailers = () => api.get("/admin/users", { params: { role: "retailer" } }).then((r) => setRetailers(r.data));

  useEffect(() => {
    loadOverview();
    loadUsers();
    loadQueue("reels");
    loadReports();
    loadTickets();
    api.get("/admin/enquiries").then((r) => setEnquiries(r.data)).catch(() => {});
    loadRetailers();
    api.get("/admin/companies").then((r) => setCompanies(r.data)).catch(() => {});
    loadVerifs();
    api.get("/admin/orders").then((r) => setAllOrders(r.data)).catch(() => {});
    api.get("/admin/disputes").then((r) => setDisputes(r.data)).catch(() => {});
    api.get("/admin/payments").then((r) => setPayments(r.data)).catch(() => {});
  }, []);

  const act = (fn, msg, after) => async () => {
    try {
      await fn();
      if (msg) toast.success(msg);
      after?.();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const isSuper = user?.role === "super_admin";

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12" data-testid="admin-page">
      <PageHeader kicker="Administration" title="Control room." />

      <Tabs defaultValue="overview">
        <TabsList className="rounded-none mb-8 flex-wrap h-auto">
          {["overview", "users", "retailers", "companies", "kyc", "moderation", "reports", "orders", "disputes", "shipping", "payments", "tickets", "enquiries", "categories"].map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`admin-tab-${t}`} className="rounded-none font-meta text-[10px]">{t}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          {overview && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard testid="ov-users" label="Users" value={overview.users} />
              <StatCard testid="ov-products" label="Products" value={overview.products} />
              <StatCard testid="ov-reels" label="Reels" value={overview.reels} />
              <StatCard testid="ov-orders" label="Orders" value={overview.orders} />
              <StatCard testid="ov-revenue" label="GMV released" value={inr(overview.revenue)} />
              <StatCard testid="ov-commission" label="Commission (10%)" value={inr(overview.commission)} />
              <StatCard testid="ov-moderation" label="Pending moderation" value={overview.pending_moderation} />
              <StatCard testid="ov-reports" label="Open reports" value={overview.open_reports} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="users">
          <div className="flex flex-wrap gap-2 mb-6">
            <Input data-testid="admin-user-search" placeholder="Search users..." className="rounded-none max-w-xs"
              value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadUsers(userQuery)} />
            <Select value={roleFilter || "all"} onValueChange={(v) => { setRoleFilter(v === "all" ? "" : v); api.get("/admin/users", { params: { q: userQuery, ...(v !== "all" ? { role: v } : {}) } }).then((r) => setUsers(r.data)); }}>
              <SelectTrigger data-testid="admin-role-filter" className="rounded-none w-44"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent className="rounded-none">
                {["all", "customer", "artist", "retailer", "company_owner", "company_admin", "company_artist", "admin", "support"].map((r) => (
                  <SelectItem key={r} value={r}>{r === "all" ? "All roles" : r.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button data-testid="admin-user-search-btn" variant="outline" className="rounded-none" onClick={() => loadUsers(userQuery)}>Search</Button>
          </div>

          {isSuper && (
            <div className="border border-border/60 p-5 mb-8 grid sm:grid-cols-5 gap-3 items-end" data-testid="create-admin-panel">
              <div>
                <Label className="font-meta text-[9px]">Name</Label>
                <Input data-testid="new-admin-name" className="rounded-none mt-1" value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} />
              </div>
              <div>
                <Label className="font-meta text-[9px]">Email</Label>
                <Input data-testid="new-admin-email" className="rounded-none mt-1" value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
              </div>
              <div>
                <Label className="font-meta text-[9px]">Password</Label>
                <Input data-testid="new-admin-password" type="password" className="rounded-none mt-1" value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              </div>
              <Select value={newAdmin.role} onValueChange={(v) => setNewAdmin({ ...newAdmin, role: v })}>
                <SelectTrigger data-testid="new-admin-role" className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                </SelectContent>
              </Select>
              <Button data-testid="create-admin-btn" className="rounded-none font-meta text-[10px]"
                onClick={act(() => api.post("/admin/users", newAdmin), "Staff account created", () => loadUsers(userQuery))}>
                Create staff
              </Button>
            </div>
          )}

          <div className="border border-border/60" data-testid="users-table">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-border/40 text-sm" data-testid={`user-row-${u.id}`}>
                <span className="font-display font-bold w-40 truncate">{u.name}</span>
                <span className="text-muted-foreground flex-1 truncate">{u.email}</span>
                <span className="font-meta text-[9px] px-2 py-1 border border-border/60">{u.role}</span>
                <StatusBadge status={u.status} />
                {["super_admin", "admin"].includes(user.role) && u.role !== "super_admin" && (
                  <>
                    <Button variant="outline" size="sm" data-testid={`verify-user-${u.id}`} className="rounded-none font-meta text-[9px]"
                      onClick={act(() => api.post(`/admin/users/${u.id}/verify`), u.verified ? "Badge removed" : "Verified", () => loadUsers(userQuery))}>
                      {u.verified ? "Unverify" : "Verify"}
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`toggle-user-${u.id}`} className="rounded-none font-meta text-[9px]"
                      onClick={act(() => api.put(`/admin/users/${u.id}/status`, { status: u.status === "active" ? "suspended" : "active" }),
                        "Status updated", () => loadUsers(userQuery))}>
                      {u.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                    {isSuper && (
                      <Button variant="outline" size="sm" data-testid={`delete-user-${u.id}`}
                        className="rounded-none font-meta text-[9px] text-primary border-primary/40"
                        onClick={act(() => api.delete(`/admin/users/${u.id}`), "User deleted", () => loadUsers(userQuery))}>
                        Delete
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="moderation">
          <div className="flex gap-2 mb-6">
            {["reels", "products"].map((t) => (
              <button key={t} data-testid={`queue-type-${t}`}
                onClick={() => { setQueueType(t); loadQueue(t); }}
                className={`font-meta text-[10px] px-4 py-2 border ${queueType === t ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
          {!queue.length ? (
            <EmptyState testid="moderation-empty" title="Queue is clear" hint="New submissions will appear here for review." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {queue.map((item) => (
                <div key={item.id} className="border border-border/60" data-testid={`queue-item-${item.id}`}>
                  <img src={fileUrl(item.media_url || item.images?.[0])} alt="" className="w-full aspect-video object-cover" />
                  <div className="p-4">
                    <p className="font-display font-bold text-sm">{item.title || item.caption}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.creator_name || item.seller_name}</p>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" data-testid={`approve-${item.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/moderation/${queueType}/${item.id}`, { action: "approve" }), "Approved", () => loadQueue())}>
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" data-testid={`reject-${item.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/moderation/${queueType}/${item.id}`, { action: "reject" }), "Rejected", () => loadQueue())}>
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {!reports.length ? (
            <EmptyState testid="reports-empty" title="No reports" />
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="border border-border/60 p-4 flex flex-wrap items-center gap-4 cursor-pointer hover:border-foreground/40 transition-colors"
                  data-testid={`report-${r.id}`} onClick={async () => {
                    const { data } = await api.get(`/admin/reports/${r.id}`);
                    setReportDetail(data);
                  }}>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm">{r.target_type} · {r.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">by {r.reporter_name} · {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  <Button size="sm" variant="outline" data-testid={`view-report-${r.id}`} className="rounded-none font-meta text-[9px]"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { data } = await api.get(`/admin/reports/${r.id}`);
                      setReportDetail(data);
                    }}>
                    View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tickets">
          <div className="space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="border border-border/60 p-5" data-testid={`admin-ticket-${t.id}`}>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <p className="font-display font-bold">{t.subject} <span className="text-xs text-muted-foreground font-normal">— {t.user_name}</span></p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    <Select value={t.status} onValueChange={(v) => api.put(`/tickets/${t.id}/status`, { status: v }).then(loadTickets)}>
                      <SelectTrigger data-testid={`ticket-status-${t.id}`} className="rounded-none h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        {["open", "answered", "resolved", "closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3 space-y-2 max-w-2xl">
                  {t.messages.map((m, i) => (
                    <p key={i} className={`text-sm ${m.staff ? "text-foreground" : "text-muted-foreground"}`}>
                      <span className="font-display font-bold mr-2">{m.from}{m.staff ? " (staff)" : ""}</span>{m.text}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2 mt-4 max-w-2xl">
                  <Input data-testid={`ticket-reply-${t.id}`} className="rounded-none" placeholder="Reply as support..."
                    value={reply[t.id] || ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
                  <Button data-testid={`ticket-reply-btn-${t.id}`} className="rounded-none font-meta text-[10px]"
                    onClick={act(() => api.post(`/tickets/${t.id}/reply`, { text: reply[t.id] }), "Replied", () => { setReply({ ...reply, [t.id]: "" }); loadTickets(); })}>
                    Reply
                  </Button>
                </div>
              </div>
            ))}
            {!tickets.length && <EmptyState testid="tickets-empty" title="No tickets" />}
          </div>
        </TabsContent>

        <TabsContent value="enquiries">
          {!enquiries.length ? (
            <EmptyState testid="enquiries-empty" title="No enquiries" hint="'Build your own art platform' enquiries land here." />
          ) : (
            <div className="space-y-3">
              {enquiries.map((e) => (
                <div key={e.id} className="border border-border/60 p-5 flex flex-wrap items-center gap-4" data-testid={`enquiry-${e.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm">{e.name} {e.company && <span className="text-muted-foreground font-normal">· {e.company}</span>}</p>
                    <p className="text-xs text-muted-foreground mt-1">{e.requirement} {e.budget && `· Budget ${isNaN(Number(e.budget)) ? e.budget : `₹${Number(e.budget).toLocaleString("en-IN")}`}`}</p>
                    {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                    <p className="font-meta text-[9px] text-muted-foreground mt-2">{new Date(e.created_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={e.status} />
                  {e.status === "open" && (
                    <Button size="sm" variant="outline" data-testid={`resolve-enquiry-${e.id}`} className="rounded-none font-meta text-[9px]"
                      onClick={act(() => api.post(`/admin/enquiries/${e.id}/resolve`), "Resolved",
                        () => api.get("/admin/enquiries").then((r) => setEnquiries(r.data)))}>
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="retailers">
          <div className="border border-border/60" data-testid="retailers-table">
            <div className="grid grid-cols-[1fr_1fr_140px_120px] gap-4 px-5 py-3 border-b border-border/60 font-meta text-[9px] text-muted-foreground">
              <span>Retailer</span><span>Email</span><span>Verification</span><span>Status</span>
            </div>
            {retailers.map((r) => {
              const v = verifs.find((x) => x.subject_id === r.id && x.subject_type === "user");
              return (
                <div key={r.id} className="grid grid-cols-[1fr_1fr_140px_120px] gap-4 px-5 py-3 border-b border-border/40 items-center text-sm" data-testid={`retailer-row-${r.id}`}>
                  <span className="font-display font-bold truncate">{r.name}</span>
                  <span className="text-muted-foreground truncate">{r.email}</span>
                  <StatusBadge status={v?.status || "draft"} />
                  <StatusBadge status={r.status} />
                </div>
              );
            })}
            {!retailers.length && <p className="px-5 py-8 text-sm text-muted-foreground">No retailers yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="companies">
          <div className="border border-border/60" data-testid="companies-table">
            <div className="grid grid-cols-[1fr_120px_140px] gap-4 px-5 py-3 border-b border-border/60 font-meta text-[9px] text-muted-foreground">
              <span>Company</span><span>Members</span><span>Verification</span>
            </div>
            {companies.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_120px_140px] gap-4 px-5 py-3 border-b border-border/40 items-center text-sm" data-testid={`company-row-${c.id}`}>
                <span className="font-display font-bold truncate">{c.name}</span>
                <span>{c.members?.length || 0}</span>
                <StatusBadge status={c.verification_status} />
              </div>
            ))}
            {!companies.length && <p className="px-5 py-8 text-sm text-muted-foreground">No companies yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="kyc">
          <div className="flex gap-2 mb-6 flex-wrap">
            {["", "submitted", "under_review", "approved", "rejected", "more_info", "suspended"].map((s) => (
              <button key={s || "all"} data-testid={`kyc-filter-${s || "all"}`}
                onClick={() => { setKycFilter(s); loadVerifs(s); }}
                className={`font-meta text-[9px] px-3 py-2 border transition-colors ${kycFilter === s ? "border-primary text-primary" : "border-border/60 text-muted-foreground"}`}>
                {s ? s.replace("_", " ") : "all"}
              </button>
            ))}
          </div>
          {!verifs.length ? (
            <EmptyState testid="kyc-empty" title="No verifications" hint="Retailer and company KYC submissions appear here." />
          ) : (
            <div className="space-y-4">
              {verifs.map((v) => (
                <div key={v.id} className="border border-border/60 p-5" data-testid={`kyc-row-${v.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display font-bold">{v.business_name} <span className="font-meta text-[9px] text-muted-foreground ml-2">{v.subject_type}</span></p>
                      <p className="text-xs text-muted-foreground mt-1">{v.business_type?.replace("_", " ")} · {v.contact_name} · {v.contact_phone}</p>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="mt-4">
                    <Button size="sm" variant="outline" data-testid={`kyc-view-${v.id}`} className="rounded-none font-meta text-[9px]"
                      onClick={() => openKycDetail(v.id)}>View details</Button>
                  </div>
                  {!["approved", "suspended"].includes(v.status) && ["super_admin", "admin"].includes(user.role) && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Input data-testid={`kyc-note-${v.id}`} placeholder="Review note (optional)" className="rounded-none w-64"
                        value={kycNote[v.id] || ""} onChange={(e) => setKycNote({ ...kycNote, [v.id]: e.target.value })} />
                      <Button size="sm" data-testid={`kyc-approve-${v.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/verifications/${v.id}/review`, { action: "approve", note: kycNote[v.id] || "" }), "Approved", () => loadVerifs(kycFilter))}>Approve</Button>
                      <Button size="sm" variant="outline" data-testid={`kyc-moreinfo-${v.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/verifications/${v.id}/review`, { action: "more_info", note: kycNote[v.id] || "More information required" }), "Requested info", () => loadVerifs(kycFilter))}>More info</Button>
                      <Button size="sm" variant="outline" data-testid={`kyc-reject-${v.id}`} className="rounded-none font-meta text-[9px] text-primary border-primary/40"
                        onClick={act(() => api.post(`/admin/verifications/${v.id}/review`, { action: "reject", note: kycNote[v.id] || "" }), "Rejected", () => loadVerifs(kycFilter))}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          <div className="border border-border/60" data-testid="admin-orders-table">
            {allOrders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-border/40 text-sm" data-testid={`admin-order-${o.id}`}>
                <span className="font-display font-bold w-40 truncate">{o.buyer_name}</span>
                <span className="text-muted-foreground flex-1 truncate">{o.items.map((i) => i.title).join(", ")}</span>
                <span className="font-meta text-xs">{inr(o.total)}</span>
                <span className="font-meta text-[9px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
                <StatusBadge status={o.status} />
              </div>
            ))}
            {!allOrders.length && <p className="px-5 py-8 text-sm text-muted-foreground">No orders yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="disputes">
          {!disputes.length ? (
            <EmptyState testid="disputes-empty" title="No open disputes" hint="Buyer disputes on escrow orders appear here for review." />
          ) : (
            <div className="space-y-4" data-testid="disputes-list">
              {disputes.map((o) => (
                <div key={o.id} className="border border-border/60 p-5" data-testid={`dispute-row-${o.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display font-bold">Order #{o.id.slice(-8)} <span className="font-meta text-[9px] text-muted-foreground ml-2">{o.buyer_name}</span></p>
                      <p className="text-xs text-muted-foreground mt-1">{o.items.map((i) => i.title).join(", ")} · {inr(o.total)} · was: {o.prev_status}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-sm mt-3 border-l-2 border-primary pl-3" data-testid={`dispute-reason-${o.id}`}>{o.dispute?.reason}</p>
                  {["super_admin", "admin"].includes(user.role) && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Input data-testid={`dispute-note-${o.id}`} placeholder="Resolution note (optional)" className="rounded-none w-64"
                        value={disputeNote[o.id] || ""} onChange={(e) => setDisputeNote({ ...disputeNote, [o.id]: e.target.value })} />
                      <Button size="sm" data-testid={`dispute-refund-${o.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/orders/${o.id}/resolve-dispute`, { action: "refund", note: disputeNote[o.id] || "" }), "Refund initiated",
                          () => api.get("/admin/disputes").then((r) => setDisputes(r.data)))}>Refund buyer</Button>
                      <Button size="sm" variant="outline" data-testid={`dispute-reject-${o.id}`} className="rounded-none font-meta text-[9px]"
                        onClick={act(() => api.post(`/admin/orders/${o.id}/resolve-dispute`, { action: "reject", note: disputeNote[o.id] || "" }), "Dispute closed — order restored",
                          () => api.get("/admin/disputes").then((r) => setDisputes(r.data)))}>Reject dispute</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shipping">
          <div className="border border-border/60" data-testid="admin-shipping-table">
            {allOrders.filter((o) => o.shipping || o.courier).map((o) => (
              <div key={o.id} className="px-5 py-4 border-b border-border/40 text-sm" data-testid={`admin-shipment-${o.id}`}>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <span className="font-display font-bold">{o.shipping?.provider || o.courier}</span>
                  <StatusBadge status={o.shipping?.delivery_status || o.status} />
                </div>
                <p className="font-meta text-[9px] text-muted-foreground mt-1">
                  {o.shipping?.shipment_id} {o.shipping?.tracking_number && `· ${o.shipping.tracking_number}`} · pickup: {o.shipping?.pickup_status || "—"} · charge {inr(o.shipping?.shipping_charge || o.shipping_charge || 0)}
                </p>
              </div>
            ))}
            {!allOrders.some((o) => o.shipping || o.courier) && <p className="px-5 py-8 text-sm text-muted-foreground">No shipments yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="border border-border/60" data-testid="admin-payments-table">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-border/40 text-sm" data-testid={`admin-payment-${p.id}`}>
                <span className="font-meta text-xs w-44 truncate">{p.payment_id}</span>
                <span className="font-meta text-xs">{inr(p.amount)}</span>
                <span className="font-meta text-[9px] text-muted-foreground">{p.method} · {p.purpose}</span>
                <span className="flex-1" />
                <StatusBadge status={p.escrow} />
              </div>
            ))}
            {!payments.length && <p className="px-5 py-8 text-sm text-muted-foreground">No payments yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="border border-border/60 p-5 grid sm:grid-cols-3 gap-3 items-end max-w-3xl" data-testid="add-category-panel">
            <div>
              <Label className="font-meta text-[9px]">Category name</Label>
              <Input data-testid="new-cat-name" className="rounded-none mt-1" value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            </div>
            <div>
              <Label className="font-meta text-[9px]">Subcategories (comma separated)</Label>
              <Input data-testid="new-cat-subs" className="rounded-none mt-1" value={newCat.subcategories}
                onChange={(e) => setNewCat({ ...newCat, subcategories: e.target.value })} />
            </div>
            <Button data-testid="add-cat-btn" className="rounded-none font-meta text-[10px]"
              onClick={act(() => api.post("/admin/categories", { name: newCat.name, subcategories: newCat.subcategories.split(",").map((s) => s.trim()).filter(Boolean) }), "Category added")}>
              Add category
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!kycDetail} onOpenChange={() => setKycDetail(null)}>
        <DialogContent className="rounded-none max-w-2xl max-h-[85vh] overflow-y-auto" data-testid={kycDetail ? `kyc-detail-modal-${kycDetail.id}` : "kyc-detail-modal"} data-lenis-prevent>
          {kycDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{kycDetail.business_name}</DialogTitle>
                <DialogDescription className="font-meta text-[10px]">{kycDetail.subject_type} · submitted {kycDetail.updated_at ? new Date(kycDetail.updated_at).toLocaleDateString() : ""}</DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <StatusBadge status={kycDetail.status} />
                  {kycDetail.reviewed_by && <span className="font-meta text-[9px] text-muted-foreground">reviewed by {kycDetail.reviewed_by}</span>}
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <Kv k="Contact" v={`${kycDetail.contact_name || "—"} · ${kycDetail.contact_phone || "—"}`} />
                  <Kv k="Business type" v={kycDetail.business_type?.replace("_", " ") || "—"} />
                  <Kv k="GSTIN" v={kycDetail.gstin || "—"} />
                  <Kv k="MSME" v={kycDetail.msme || "—"} />
                  <Kv k="PAN" v={kycDetail.pan || "—"} />
                  <Kv k={kycDetail.govt_id_type || "Govt ID"} v={kycDetail.govt_id || "—"} />
                </div>
                {kycDetail.address && <p className="text-xs text-muted-foreground" data-testid="kyc-detail-address">{kycDetail.address}</p>}
                {kycDetail.documents?.length > 0 && (
                  <div data-testid="kyc-detail-documents">
                    <p className="font-meta text-[10px] text-muted-foreground mb-2">Documents</p>
                    <div className="space-y-2">
                      {kycDetail.documents.map((d, i) => (
                        <div key={d.id || i} className="flex items-center justify-between gap-3 border border-border/60 px-3 py-2 text-xs" data-testid={`kyc-doc-${d.id || i}`}>
                          <span className="font-display font-bold">{d.label || d.type || d.name || `Document ${i + 1}`}</span>
                          <span className="flex items-center gap-3">
                            {d.status && <StatusBadge status={d.status} />}
                            {(d.url || d.path) && <a href={fileUrl(d.url || d.path)} target="_blank" rel="noreferrer" className="font-meta text-[9px] text-primary">View file</a>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {kycDetail.notes?.length > 0 && (
                  <div className="space-y-1.5" data-testid="kyc-detail-notes">
                    {kycDetail.notes.map((n, i) => (
                      <p key={i} className="text-xs text-muted-foreground"><span className="font-display font-bold text-foreground">{n.by}:</span> {n.text}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={!!reportDetail} onOpenChange={() => setReportDetail(null)}>
        <DialogContent className="rounded-none max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="report-detail-modal">
          {reportDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Report #{reportDetail.id.slice(-8)}</DialogTitle>
                <DialogDescription className="sr-only">Full report detail and moderation actions</DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <StatusBadge status={reportDetail.status} />
                  <span className="font-meta text-[9px] text-muted-foreground">{reportDetail.target_type} · {new Date(reportDetail.created_at).toLocaleString()}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <Kv k="Reason" v={reportDetail.reason} />
                  <Kv k="Reporter" v={reportDetail.reporter ? `${reportDetail.reporter.name} (${reportDetail.reporter.email})` : "—"} />
                  <Kv k="Reported user" v={reportDetail.reported_user ? `${reportDetail.reported_user.name} · ${reportDetail.reported_user.role} · ${reportDetail.reported_user.status}` : "—"} />
                  <Kv k="Related reports" v={String(reportDetail.related_reports || 0)} />
                </div>
                {reportDetail.content && (
                  <div className="border border-border/60 p-4 flex gap-4" data-testid="report-content-preview">
                    {(reportDetail.content.media_url || reportDetail.content.images?.[0]) && (
                      <img src={reportDetail.content.media_url || reportDetail.content.images?.[0]} alt="" className="h-20 w-20 object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm">{reportDetail.content.title || reportDetail.content.caption || reportDetail.content.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{reportDetail.content.description || ""}</p>
                      <StatusBadge status={reportDetail.content.status} />
                    </div>
                  </div>
                )}
                {reportDetail.notes?.length > 0 && (
                  <div className="space-y-1.5" data-testid="report-notes">
                    {reportDetail.notes.map((n, i) => (
                      <p key={i} className="text-xs text-muted-foreground"><span className="font-display font-bold text-foreground">{n.by}:</span> {n.text}</p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2" data-testid="report-status-actions">
                  {["under_review", "resolved", "rejected", "escalated"].map((s) => (
                    <Button key={s} size="sm" variant={reportDetail.status === s ? "default" : "outline"}
                      data-testid={`report-status-${s}`} className="rounded-none font-meta text-[9px]"
                      onClick={act(async () => {
                        await api.put(`/admin/reports/${reportDetail.id}`, { status: s });
                        const { data } = await api.get(`/admin/reports/${reportDetail.id}`);
                        setReportDetail(data);
                      }, "Status updated", loadReports)}>
                      {s.replace("_", " ")}
                    </Button>
                  ))}
                </div>
                {["super_admin", "admin"].includes(user.role) && (
                  <div className="flex flex-wrap gap-2" data-testid="report-mod-actions">
                    {["remove_content", "restrict_content", "warn_user", "suspend_user"].map((a) => (
                      <Button key={a} size="sm" variant="outline" data-testid={`report-action-${a}`}
                        className={`rounded-none font-meta text-[9px] ${a === "suspend_user" || a === "remove_content" ? "text-primary border-primary/40" : ""}`}
                        onClick={act(() => api.post(`/admin/reports/${reportDetail.id}/action`, { action: a }), `Done: ${a.replace("_", " ")}`, loadReports)}>
                        {a.replace(/_/g, " ")}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input data-testid="report-note-input" className="rounded-none" placeholder="Add internal note..."
                    value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
                  <Button data-testid="report-note-add" variant="outline" className="rounded-none font-meta text-[9px]"
                    onClick={act(async () => {
                      await api.put(`/admin/reports/${reportDetail.id}`, { note: reportNote });
                      setReportNote("");
                      const { data } = await api.get(`/admin/reports/${reportDetail.id}`);
                      setReportDetail(data);
                    }, "Note added")}>
                    Add note
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kv({ k, v }) {
  if (!v) return null;
  return (
    <div>
      <p className="font-meta text-[9px] text-muted-foreground">{k}</p>
      <p className="text-sm mt-0.5 break-words">{v}</p>
    </div>
  );
}
