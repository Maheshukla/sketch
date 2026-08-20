import { PageHeader } from "@/components/cards";

const CONTENT = {
  terms: {
    kicker: "Legal",
    title: "Terms of service.",
    sections: [
      ["The platform", "Sketch is a multi-vendor creative ecosystem connecting artists, studios, retailers and collectors. By using Sketch you agree to these terms."],
      ["Accounts & roles", "You are responsible for your account. Retailers and companies must complete verification before selling. Individual artists and customers may register and participate immediately, subject to platform moderation."],
      ["Sales & escrow", "Payments are held in escrow and released when the buyer confirms delivery or approves completed custom work. All sales are final — Sketch does not offer refunds; disputes are resolved through support before escrow release."],
      ["Content", "You retain rights to your work and grant Sketch a licence to display it. Do not upload content you do not own. Moderators may review, restrict or remove content that violates policy."],
      ["Commissions", "Custom orders follow the platform pipeline: request, review, estimate, approval, payment, delivery, completion. Creators set prices and deadlines; the platform mediates disputes."],
      ["Couriers", "Shipping is fulfilled by third-party courier partners selected by the seller. Sketch is not a carrier and does not operate a delivery network."],
    ],
  },
  privacy: {
    kicker: "Legal",
    title: "Privacy policy.",
    sections: [
      ["What we collect", "Account details (name, email, mobile), profile content, orders, addresses and — for sellers — verification documents (GSTIN, MSME, PAN, government ID, bank details)."],
      ["Verification data", "KYC documents are stored securely, masked in your dashboard, and accessible only to authorized platform administrators. They never appear on public profiles."],
      ["How we use data", "To operate the marketplace: orders, payments, escrow, notifications, moderation, analytics and support."],
      ["Sharing", "Order details are shared with the seller and the selected courier partner for fulfilment. We do not sell personal data."],
      ["Your controls", "Manage privacy, notifications and appearance in Settings. Request account deletion through a support ticket."],
    ],
  },
};

export default function StaticPage({ kind }) {
  const c = CONTENT[kind];
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-12" data-testid={`${kind}-page`}>
      <PageHeader kicker={c.kicker} title={c.title} />
      <div className="space-y-8">
        {c.sections.map(([h, body], i) => (
          <section key={i}>
            <h2 className="font-display text-xl font-bold tracking-tight mb-2">{h}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </section>
        ))}
      </div>
      <p className="font-meta text-[9px] text-muted-foreground mt-12">Last updated · August 2026</p>
    </div>
  );
}
