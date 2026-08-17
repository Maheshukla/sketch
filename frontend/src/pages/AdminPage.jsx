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
  const [reply, setReply] = useState({});
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "", role: "admin" });
  const [newCat, setNewCat] = useState({ name: "", subcategories: "" });

  const loadOverview = () => api.get("/admin/overview").then((r) => setOverview(r.data));
  const loadUsers = (q = "") => api.get("/admin/users", { params: { q } }).then((r) => setUsers(r.data));
  const loadQueue = (t = queueType) => api.get("/admin/moderation", { params: { type: t } }).then((r) => setQueue(r.data));
  const loadReports = () => api.get("/admin/reports").then((r) => setReports(r.data));
  const loadTickets = () => api.get("/tickets").then((r) => setTickets(r.data));

  useEffect(() => {
    loadOverview();
    loadUsers();
    loadQueue("reels");
    loadReports();
    loadTickets();
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
          {["overview", "users", "moderation", "reports", "tickets", "categories"].map((t) => (
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
          <div className="flex gap-2 mb-6">
            <Input data-testid="admin-user-search" placeholder="Search users..." className="rounded-none max-w-xs"
              value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadUsers(userQuery)} />
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
                  <Button variant="outline" size="sm" data-testid={`toggle-user-${u.id}`} className="rounded-none font-meta text-[9px]"
                    onClick={act(() => api.put(`/admin/users/${u.id}/status`, { status: u.status === "active" ? "suspended" : "active" }),
                      "Status updated", () => loadUsers(userQuery))}>
                    {u.status === "active" ? "Suspend" : "Activate"}
                  </Button>
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
                <div key={r.id} className="border border-border/60 p-4 flex flex-wrap items-center gap-4" data-testid={`report-${r.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm">{r.target_type} · {r.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">by {r.reporter_name} · {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  {r.status === "open" && (
                    <Button size="sm" variant="outline" data-testid={`resolve-report-${r.id}`} className="rounded-none font-meta text-[9px]"
                      onClick={act(() => api.post(`/admin/reports/${r.id}/resolve`), "Resolved", loadReports)}>
                      Resolve
                    </Button>
                  )}
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
    </div>
  );
}
