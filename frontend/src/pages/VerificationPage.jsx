import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, FileCheck, Save, Send } from "lucide-react";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, StatusBadge, EmptyState } from "@/components/cards";

const KYC_FLOW = ["draft", "submitted", "under_review", "approved"];
const BIZ_TYPES = ["individual", "proprietorship", "partnership", "llp", "private_limited"];
const ID_TYPES = ["Aadhaar", "Passport", "Driving license", "Voter ID"];

const EMPTY = {
  business_name: "", business_type: "proprietorship", gstin: "", msme: "", pan: "",
  govt_id_type: "", govt_id: "", address: "", contact_name: "", contact_phone: "",
  account_number: "", ifsc: "",
};

export default function VerificationPage() {
  const { user } = useAuth();
  const [verifs, setVerifs] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const isCompany = user?.role?.startsWith("company_");
  const subjectType = isCompany ? "company" : "user";
  const mine = verifs.find((v) => v.subject_type === subjectType);
  const locked = mine?.status === "approved";

  const load = () => api.get("/verification/my").then((r) => {
    setVerifs(r.data);
    const v = r.data.find((x) => x.subject_type === subjectType);
    if (v) setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] || ""])) });
  }).catch(() => {});

  useEffect(() => {
    load();
  }, [user]);

  const save = async (action) => {
    setBusy(true);
    try {
      await api.post("/verification/submit", { ...form, subject_type: subjectType, action });
      toast.success(action === "submit" ? "Submitted for review" : "Draft saved");
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = ["company_owner", "company_admin", "retailer"].includes(user?.role);
  const stepIdx = mine ? KYC_FLOW.indexOf(mine.status) : -1;

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-8 py-12" data-testid="verification-page">
      <PageHeader kicker="Verification / KYC"
        title={isCompany ? "Company verification." : "Retailer verification."}
        sub="Approved sellers can list products, receive orders and accept paid commissions. GST is optional — MSME, PAN or a government ID works too." />

      {mine && (
        <div className="border border-border/60 p-5 mb-8" data-testid="kyc-status-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display font-bold">{mine.subject_name || mine.business_name}</p>
            <StatusBadge status={mine.status} />
          </div>
          {mine.status !== "rejected" && mine.status !== "more_info" && mine.status !== "suspended" && (
            <div className="flex gap-1.5 mt-4" data-testid="kyc-steps">
              {KYC_FLOW.map((s, i) => (
                <div key={s} className={`h-1 flex-1 ${i <= stepIdx ? "bg-primary" : "bg-secondary"}`} />
              ))}
            </div>
          )}
          {mine.notes?.length > 0 && (
            <div className="mt-4 border-l-2 border-amber-400 pl-3" data-testid="kyc-notes">
              {mine.notes.slice(-2).map((n, i) => (
                <p key={i} className="text-sm text-muted-foreground"><span className="font-display font-bold text-foreground">{n.by}:</span> {n.text}</p>
              ))}
            </div>
          )}
          {mine.status === "approved" && (
            <p className="flex items-center gap-2 text-sm text-emerald-500 mt-3">
              <BadgeCheck className="h-4 w-4" /> Verified — you can list products and accept paid work.
            </p>
          )}
        </div>
      )}

      {!canSubmit ? (
        <EmptyState testid="kyc-na" title="Nothing to verify"
          hint="Verification applies to retailer and company accounts. Register as a retailer or create a company first." />
      ) : (
        <div className="border border-border/60 p-6 space-y-5" data-testid="kyc-form">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={isCompany ? "Company / firm name *" : "Business name *"} testid="kyc-business-name" value={form.business_name}
              onChange={(v) => setForm({ ...form, business_name: v })} disabled={locked} />
            <div>
              <Label className="font-meta text-[10px]">Legal / business type</Label>
              <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })} disabled={locked}>
                <SelectTrigger data-testid="kyc-business-type" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {BIZ_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="font-meta text-[9px] text-muted-foreground">Identity — at least one required</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="GSTIN (optional)" testid="kyc-gstin" value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} disabled={locked} />
            <Field label="MSME / Udyam no. (optional)" testid="kyc-msme" value={form.msme} onChange={(v) => setForm({ ...form, msme: v })} disabled={locked} />
            <Field label="PAN (optional)" testid="kyc-pan" value={form.pan} onChange={(v) => setForm({ ...form, pan: v })} disabled={locked} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="font-meta text-[10px]">Govt ID type</Label>
                <Select value={form.govt_id_type} onValueChange={(v) => setForm({ ...form, govt_id_type: v })} disabled={locked}>
                  <SelectTrigger data-testid="kyc-govt-id-type" className="rounded-none mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Field label="ID number" testid="kyc-govt-id" value={form.govt_id} onChange={(v) => setForm({ ...form, govt_id: v })} disabled={locked} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Business address" testid="kyc-address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} disabled={locked} />
            <Field label="Contact person" testid="kyc-contact-name" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} disabled={locked} />
            <Field label="Contact phone" testid="kyc-contact-phone" value={form.contact_phone} onChange={(v) => setForm({ ...form, contact_phone: v })} disabled={locked} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Account no. (optional)" testid="kyc-account" value={form.account_number} onChange={(v) => setForm({ ...form, account_number: v })} disabled={locked} />
              <Field label="IFSC" testid="kyc-ifsc" value={form.ifsc} onChange={(v) => setForm({ ...form, ifsc: v })} disabled={locked} />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Documents are stored securely, masked on your dashboard (e.g. PAN *****1234F) and visible only to platform admins.
          </p>

          {!locked && (
            <div className="flex gap-3">
              <Button data-testid="kyc-save-draft" variant="outline" disabled={busy} onClick={() => save("save")}
                className="rounded-none font-meta text-[10px] h-11">
                <Save className="h-4 w-4 mr-2" /> Save draft
              </Button>
              <Button data-testid="kyc-submit" disabled={busy} onClick={() => save("submit")}
                className="rounded-none font-meta text-[10px] h-11">
                <Send className="h-4 w-4 mr-2" /> Submit for review
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, testid, disabled }) {
  return (
    <div>
      <Label className="font-meta text-[10px]">{label}</Label>
      <Input data-testid={testid} className="rounded-none mt-1" value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
