import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, LayoutDashboard, Package, Settings, Sparkles, Trash2, UserPlus } from "lucide-react";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, EmptyState } from "@/components/cards";

function VerificationLine() {
  const [verifs, setVerifs] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api.get("/verification/my").then((r) => setVerifs(r.data)).catch(() => {});
  }, []);
  const cv = verifs.find((v) => v.subject_type === "company");
  return (
    <button data-testid="company-kyc-status" onClick={() => navigate("/verification")}
      className="mb-8 border border-border/60 px-4 py-3 flex items-center gap-3 hover:border-foreground/40 transition-colors w-full text-left">
      <span className={`h-2 w-2 rounded-full ${cv?.status === "approved" ? "bg-emerald-500" : "bg-amber-400"}`} />
      <span className="text-sm">Company verification: <span className="font-display font-bold">{cv?.status?.replace("_", " ") || "not started"}</span></span>
      <span className="font-meta text-[9px] text-primary ml-auto">Manage →</span>
    </button>
  );
}

export default function CompanyPage() {

  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(undefined);
  const [create, setCreate] = useState({ name: "", description: "" });
  const [member, setMember] = useState({ email: "", role: "artist" });

  const load = () => api.get("/companies/my").then((r) => setCompany(r.data));
  useEffect(() => {
    load();
  }, []);

  if (company === undefined) return <div className="min-h-screen" />;

  if (!company) {
    const canCreate = ["company_owner", "artist"].includes(user?.role);
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-12" data-testid="company-create-page">
        <PageHeader kicker="Company account" title="Register your studio."
          sub="A company account lets an owner and admins receive custom requests, estimate projects and assign work to team artists." />
        {canCreate ? (
          <div className="border border-border/60 p-6 space-y-4">
            <div>
              <Label className="font-meta text-[10px]">Studio / company name</Label>
              <Input data-testid="company-name" className="rounded-none mt-1" value={create.name}
                onChange={(e) => setCreate({ ...create, name: e.target.value })} />
            </div>
            <div>
              <Label className="font-meta text-[10px]">What do you do?</Label>
              <Textarea data-testid="company-description" className="rounded-none mt-1" value={create.description}
                onChange={(e) => setCreate({ ...create, description: e.target.value })} />
            </div>
            <Button data-testid="company-create-btn" className="rounded-none font-meta text-[10px] h-11 px-8"
              onClick={async () => {
                try {
                  await api.post("/companies", create);
                  toast.success("Company registered");
                  await refresh();
                  load();
                } catch (e) {
                  toast.error(fmtErr(e));
                }
              }}>
              Create company
            </Button>
          </div>
        ) : (
          <EmptyState testid="company-none" title="You're not part of a company"
            hint="Register as an artist first, then create a studio — or ask a company admin to add your email." />
        )}
      </div>
    );
  }

  const myRole = company.members?.find((m) => String(m.user_id) === user.id)?.role;
  const canManage = ["owner", "admin"].includes(myRole);

  const addMember = async () => {
    try {
      await api.post(`/companies/${company.id}/members`, member);
      toast.success("Member added");
      setMember({ email: "", role: "artist" });
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const removeMember = async (uid) => {
    try {
      await api.delete(`/companies/${company.id}/members/${uid}`);
      toast.success("Member removed");
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-8 py-12" data-testid="company-page">
      <PageHeader kicker="Company" title={company.name} sub={company.description} />

      <VerificationLine />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10" data-testid="company-quicklinks">
        {[
          { icon: Sparkles, label: "Projects & requests", to: "/custom-orders", tid: "ql-projects" },
          { icon: Package, label: "Order management", to: "/orders", tid: "ql-orders" },
          { icon: LayoutDashboard, label: "Revenue & analytics", to: "/dashboard", tid: "ql-revenue" },
          { icon: Settings, label: "Settings", to: "/settings", tid: "ql-settings" },
        ].map((l) => (
          <button key={l.tid} data-testid={l.tid} onClick={() => navigate(l.to)}
            className="border border-border/60 p-4 text-left hover:border-foreground/40 transition-colors group">
            <l.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mb-3" />
            <p className="font-display font-bold text-sm">{l.label}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-3" data-testid="team-list">
          <p className="font-meta text-[10px] text-muted-foreground">Team — {company.members.length} members</p>
          {company.members.map((m) => (
            <div key={m.email} className="border border-border/60 p-4 flex items-center gap-4" data-testid={`team-member-${m.email}`}>
              <div className="h-10 w-10 bg-secondary flex items-center justify-center font-display font-bold">
                {m.name.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-sm">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className="font-meta text-[9px] px-2 py-1 border border-border/60">{m.role}</span>
              {canManage && m.role !== "owner" && (
                <button data-testid={`remove-member-${m.email}`} onClick={() => removeMember(m.user_id)}
                  className="text-muted-foreground hover:text-primary transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <aside className="border border-border/60 p-6 h-fit space-y-4" data-testid="add-member-panel">
            <p className="font-display font-bold flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add member</p>
            <div>
              <Label className="font-meta text-[10px]">Member email</Label>
              <Input data-testid="member-email" className="rounded-none mt-1" placeholder="artist@email.com" value={member.email}
                onChange={(e) => setMember({ ...member, email: e.target.value })} />
            </div>
            <div>
              <Label className="font-meta text-[10px]">Role</Label>
              <Select value={member.role} onValueChange={(v) => setMember({ ...member, role: v })}>
                <SelectTrigger data-testid="member-role" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="artist">Artist</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="add-member-btn" onClick={addMember} className="w-full rounded-none font-meta text-[10px] h-10">Add to team</Button>
            <p className="text-[11px] text-muted-foreground flex gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Only owners and admins receive and estimate custom requests. Team artists get assigned projects.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
