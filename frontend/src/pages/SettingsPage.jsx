import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, CreditCard, Lock, Moon, Shield, Sun, Truck, User } from "lucide-react";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/cards";

const DEFAULTS = {
  private_profile: false, show_activity: true,
  notify_orders: true, notify_social: true, notify_marketing: false,
  default_payment: "upi", default_address: "",
};

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { theme, toggle } = useTheme();
  const [account, setAccount] = useState({ name: "", bio: "", mobile: "", specialty: "" });
  const [settings, setSettings] = useState(DEFAULTS);
  const [courier, setCourier] = useState("Delhivery");
  const [couriers, setCouriers] = useState([]);

  useEffect(() => {
    if (user) {
      setAccount({ name: user.name || "", bio: user.bio || "", mobile: user.mobile || "", specialty: user.specialty || "" });
      setSettings({ ...DEFAULTS, ...(user.settings || {}) });
      setCourier(user.courier_preference || "Delhivery");
    }
    api.get("/couriers").then((r) => setCouriers(r.data));
  }, [user]);

  const saveAccount = async () => {
    try {
      await api.put("/users/me", account);
      await refresh();
      toast.success("Account updated");
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api.put("/users/me/settings", next);
      toast.success("Saved");
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const saveShipping = async () => {
    try {
      await api.put("/users/me", { courier_preference: courier });
      await saveSettings({});
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-8 py-12" data-testid="settings-page">
      <PageHeader kicker="Settings" title="Account settings." />

      <div className="space-y-6">
        <Section icon={User} title="Account" testid="settings-account">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="font-meta text-[10px]">Display name</Label>
              <Input data-testid="settings-name" className="rounded-none mt-1" value={account.name}
                onChange={(e) => setAccount({ ...account, name: e.target.value })} />
            </div>
            <div>
              <Label className="font-meta text-[10px]">Mobile</Label>
              <Input data-testid="settings-mobile" className="rounded-none mt-1" value={account.mobile}
                onChange={(e) => setAccount({ ...account, mobile: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="font-meta text-[10px]">Specialty</Label>
            <Input data-testid="settings-specialty" className="rounded-none mt-1" value={account.specialty}
              onChange={(e) => setAccount({ ...account, specialty: e.target.value })} placeholder="e.g. Watercolor portraits" />
          </div>
          <div>
            <Label className="font-meta text-[10px]">Bio</Label>
            <Textarea data-testid="settings-bio" className="rounded-none mt-1" rows={3} value={account.bio}
              onChange={(e) => setAccount({ ...account, bio: e.target.value })} />
          </div>
          <Button data-testid="settings-account-save" onClick={saveAccount} className="rounded-none font-meta text-[10px]">Save account</Button>
        </Section>

        <Section icon={Lock} title="Privacy" testid="settings-privacy">
          <ToggleRow testid="privacy-private" label="Private profile" desc="Only followers can see your portfolio"
            checked={settings.private_profile} onChange={(v) => saveSettings({ private_profile: v })} />
          <ToggleRow testid="privacy-activity" label="Show activity status" desc="Let others see when you're active"
            checked={settings.show_activity} onChange={(v) => saveSettings({ show_activity: v })} />
        </Section>

        <Section icon={Bell} title="Notifications" testid="settings-notifications">
          <ToggleRow testid="notify-orders" label="Orders & payments" desc="Order updates, escrow releases, shipping"
            checked={settings.notify_orders} onChange={(v) => saveSettings({ notify_orders: v })} />
          <ToggleRow testid="notify-social" label="Social" desc="Follows, likes, comments"
            checked={settings.notify_social} onChange={(v) => saveSettings({ notify_social: v })} />
          <ToggleRow testid="notify-marketing" label="Product updates" desc="New features and creator spotlights"
            checked={settings.notify_marketing} onChange={(v) => saveSettings({ notify_marketing: v })} />
        </Section>

        <Section icon={CreditCard} title="Payments" testid="settings-payments">
          <Label className="font-meta text-[10px]">Preferred payment method</Label>
          <Select value={settings.default_payment} onValueChange={(v) => saveSettings({ default_payment: v })}>
            <SelectTrigger data-testid="settings-payment-method" className="rounded-none mt-1 max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Credit / Debit card</SelectItem>
              <SelectItem value="netbanking">Net banking</SelectItem>
              <SelectItem value="wallet">Wallet</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">All payments are held in escrow until delivery is confirmed.</p>
        </Section>

        <Section icon={Truck} title="Shipping" testid="settings-shipping">
          <div>
            <Label className="font-meta text-[10px]">Default delivery address</Label>
            <Textarea data-testid="settings-address" className="rounded-none mt-1" rows={2} value={settings.default_address}
              onChange={(e) => setSettings({ ...settings, default_address: e.target.value })} placeholder="Street, city, state, PIN" />
          </div>
          <div>
            <Label className="font-meta text-[10px]">Preferred courier (as seller)</Label>
            <Select value={courier} onValueChange={setCourier}>
              <SelectTrigger data-testid="settings-courier" className="rounded-none mt-1 max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                {couriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="settings-shipping-save" onClick={saveShipping} className="rounded-none font-meta text-[10px]">Save shipping</Button>
        </Section>

        <Section icon={theme === "dark" ? Moon : Sun} title="Theme" testid="settings-theme">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Appearance</p>
              <p className="text-[11px] text-muted-foreground">Currently {theme} mode</p>
            </div>
            <Button data-testid="settings-theme-toggle" variant="outline" onClick={toggle} className="rounded-none font-meta text-[10px]">
              Switch to {theme === "dark" ? "light" : "dark"}
            </Button>
          </div>
        </Section>

        <Section icon={Shield} title="Security" testid="settings-security">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{user?.email || user?.mobile}</span>. Sessions use secure httpOnly cookies with automatic refresh and brute-force lockout protection.
          </p>
          <p className="text-[11px] text-muted-foreground">To change your password, sign out and use OTP sign-in to regain access, then contact support to set a new password.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, testid }) {
  return (
    <section className="border border-border/60 p-6 space-y-4" data-testid={testid}>
      <p className="font-display font-bold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </p>
      {children}
    </section>
  );
}

function ToggleRow({ label, desc, checked, onChange, testid }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch data-testid={testid} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
