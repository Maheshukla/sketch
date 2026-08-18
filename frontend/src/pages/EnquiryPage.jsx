import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, CheckCircle2 } from "lucide-react";
import api, { fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/cards";

const REQUIREMENTS = [
  "Artist marketplace", "Wedding / events platform", "Design studio storefront",
  "Handmade products store", "Creative community + reels", "Something else",
];

export default function EnquiryPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", company: "", requirement: "", budget: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.requirement) return toast.error("Name and requirement are required");
    setBusy(true);
    try {
      await api.post("/enquiries", form);
      setDone(true);
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-24 text-center" data-testid="enquiry-success">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-6" />
        <h1 className="font-display text-4xl font-black tracking-tighter">Enquiry received.</h1>
        <p className="text-muted-foreground mt-4">Our team will review your requirement and reach out with a proposal within 2 business days.</p>
        <Button data-testid="enquiry-back-home" onClick={() => navigate("/")} className="rounded-none font-meta text-[11px] h-11 px-8 mt-8">
          Back to Sketch
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-12" data-testid="enquiry-page">
      <PageHeader kicker="For brands, studios & galleries" title="Build your own art platform."
        sub="Sketch powers white-label creative ecosystems. Tell us what you need and we'll craft a proposal." />

      <form onSubmit={submit} className="border border-border/60 p-6 sm:p-8 space-y-5" data-testid="enquiry-form">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-meta text-[10px]">Your name *</Label>
            <Input data-testid="enquiry-name" required className="rounded-none mt-1" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="font-meta text-[10px]">Company / studio</Label>
            <Input data-testid="enquiry-company" className="rounded-none mt-1" value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-meta text-[10px]">Requirement *</Label>
            <Select value={form.requirement} onValueChange={(v) => setForm({ ...form, requirement: v })}>
              <SelectTrigger data-testid="enquiry-requirement" className="rounded-none mt-1">
                <SelectValue placeholder="Select a platform type" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                {REQUIREMENTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-meta text-[10px]">Budget (₹)</Label>
            <Input data-testid="enquiry-budget" type="number" className="rounded-none mt-1" value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="e.g. 250000" />
          </div>
        </div>
        <div>
          <Label className="font-meta text-[10px]">Describe your vision</Label>
          <Textarea data-testid="enquiry-description" className="rounded-none mt-1" rows={5} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Audience, features, timeline, references..." />
        </div>
        <Button data-testid="enquiry-submit" disabled={busy} className="w-full rounded-none font-meta text-[11px] h-12">
          <Building2 className="h-4 w-4 mr-2" /> {busy ? "Submitting..." : "Submit enquiry"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">No commitment — we'll respond with scope, timeline and pricing.</p>
      </form>
    </div>
  );
}
