import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader, EmptyState, StatusBadge } from "@/components/cards";

const FAQS = [
  ["How does escrow work?", "Your payment is held securely by Sketch and only released to the creator after you confirm delivery of the order or final artwork."],
  ["What is the advance payment option?", "For custom orders you can pay 30% upfront so the creator can begin work. The remainder is settled as agreed with the creator."],
  ["How is my order shipped?", "Sellers ship via third-party courier partners (Delhivery, Blue Dart, DTDC, Ekart, India Post, Shiprocket). You receive the courier name and tracking ID on your order."],
  ["How do commissions work for artists?", "Sketch charges a 10% platform fee on released payouts. GST, shipping and packaging are calculated transparently at checkout."],
  ["How do I become a seller?", "Register as an Artist, Retailer or Company, then use the Studio to upload reels, products and portfolio pieces. Content goes live after moderation."],
  ["What is the refund policy?", "There is none — all sales are final. Your payment stays in escrow until you confirm delivery, and any dispute is handled through a support ticket before release."],
];

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const [reply, setReply] = useState({});

  const load = () => api.get("/tickets").then((r) => setTickets(r.data));
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.subject || !form.message) return toast.error("Subject and message required");
    try {
      await api.post("/tickets", form);
      toast.success("Ticket created — our team will respond");
      setForm({ subject: "", category: "general", message: "" });
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const sendReply = async (id) => {
    if (!reply[id]?.trim()) return;
    try {
      await api.post(`/tickets/${id}/reply`, { text: reply[id] });
      setReply({ ...reply, [id]: "" });
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-8 py-12" data-testid="support-page">
      <PageHeader kicker="Support" title="How can we help?" />

      <h2 className="font-display text-2xl font-black tracking-tight mb-4">FAQs</h2>
      <Accordion type="single" collapsible className="mb-12" data-testid="faq-list">
        {FAQS.map(([q, a], i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="border-border/60">
            <AccordionTrigger data-testid={`faq-${i}`} className="font-display font-bold text-left">{q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <h2 className="font-display text-2xl font-black tracking-tight mb-4">Open a ticket</h2>
      <div className="border border-border/60 p-6 space-y-4 mb-12" data-testid="new-ticket-form">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="font-meta text-[10px]">Subject</Label>
            <Input data-testid="ticket-subject" className="rounded-none mt-1" value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <Label className="font-meta text-[10px]">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="ticket-category" className="rounded-none mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                {["general", "order", "payment", "dispute", "account", "copyright"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="font-meta text-[10px]">Message</Label>
          <Textarea data-testid="ticket-message" className="rounded-none mt-1" rows={4} value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        <Button data-testid="ticket-submit" onClick={submit} className="rounded-none font-meta text-[10px] h-11 px-8">Submit ticket</Button>
      </div>

      <h2 className="font-display text-2xl font-black tracking-tight mb-4">Your tickets</h2>
      {!tickets.length ? (
        <EmptyState testid="my-tickets-empty" title="No tickets yet" />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="border border-border/60 p-5" data-testid={`ticket-${t.id}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-display font-bold">{t.subject}</p>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-3 space-y-2">
                {t.messages.map((m, i) => (
                  <p key={i} className={`text-sm ${m.staff ? "text-foreground" : "text-muted-foreground"}`}>
                    <span className="font-display font-bold mr-2">{m.from}{m.staff ? " (support)" : ""}</span>{m.text}
                  </p>
                ))}
              </div>
              {!["resolved", "closed"].includes(t.status) && (
                <div className="flex gap-2 mt-4">
                  <Input data-testid={`ticket-reply-input-${t.id}`} className="rounded-none" placeholder="Write a reply..."
                    value={reply[t.id] || ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
                  <Button data-testid={`ticket-reply-send-${t.id}`} variant="outline" className="rounded-none font-meta text-[10px]"
                    onClick={() => sendReply(t.id)}>Send</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
