import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Brush, Building2, ShoppingBag, Store } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api, { fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROLE_CARDS = [
  { value: "customer", label: "Customer", desc: "Collect art & commission work", icon: ShoppingBag },
  { value: "artist", label: "Artist", desc: "Showcase & sell your work", icon: Brush },
  { value: "retailer", label: "Retailer", desc: "Sell supplies & assets", icon: Store },
  { value: "company", label: "Studio / Company", desc: "Manage a creative team", icon: Building2 },
];

export default function AuthPage() {
  const { user, login, register, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "", role: "customer", mobile: "" });
  const [otpId, setOtpId] = useState("");
  const [otpSent, setOtpSent] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(location.state?.from || "/", { replace: true });
  }, [user, navigate, location.state]);

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginForm.email, loginForm.password);
      toast.success("Welcome back");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(regForm);
      toast.success("Account created — welcome to Sketch");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    if (!otpId.trim()) return toast.error("Enter your email or mobile number");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/otp/request", { identifier: otpId });
      setOtpSent(data.dev_otp);
      toast.success("OTP sent (demo: shown below)");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  const doOtpVerify = async () => {
    setBusy(true);
    try {
      await verifyOtp({ identifier: otpId, otp: otpCode });
      toast.success("Signed in with OTP");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = () => {
    const redirect = encodeURIComponent(`${window.location.origin}/auth/callback`);
    window.location.href = `https://auth.emergentagent.com/?redirect=${redirect}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#050505] text-white relative overflow-hidden">
        <Link2 />
        <div className="relative z-10">
          <p className="font-display text-2xl font-black tracking-tighter">
            Sketch<span className="text-primary">.</span>
          </p>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-5xl xl:text-6xl font-black tracking-tighter leading-none">
            The gallery<br />that never<br />closes.
          </h1>
          <p className="text-white/60 mt-6 max-w-sm">
            Discover artists, shop original work, commission custom pieces — one creative ecosystem.
          </p>
        </div>
        <p className="font-meta text-[10px] text-white/40 relative z-10">EST. 2026 — FOR CREATORS</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <p className="font-display text-2xl font-black tracking-tighter mb-8 lg:hidden">
            Sketch<span className="text-primary">.</span>
          </p>

          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid grid-cols-2 rounded-none w-full mb-8">
              <TabsTrigger value="login" data-testid="tab-login" className="rounded-none font-meta text-[10px]">Sign in</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register" className="rounded-none font-meta text-[10px]">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={doLogin} className="space-y-4" data-testid="login-form">
                <div>
                  <Label className="font-meta text-[10px]">Email</Label>
                  <Input data-testid="login-email" type="email" required className="rounded-none mt-1"
                    value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Password</Label>
                  <Input data-testid="login-password" type="password" required className="rounded-none mt-1"
                    value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                </div>
                <Button data-testid="login-submit" disabled={busy} className="w-full rounded-none font-meta text-[11px] h-11">
                  {busy ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="flex items-center gap-4 my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="font-meta text-[9px] text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-3 border border-border/60 p-4" data-testid="otp-login-block">
                <Label className="font-meta text-[10px]">Sign in with OTP (email / mobile)</Label>
                <div className="flex gap-2">
                  <Input data-testid="otp-identifier" placeholder="you@email.com or 98XXXXXXXX" className="rounded-none"
                    value={otpId} onChange={(e) => setOtpId(e.target.value)} />
                  <Button type="button" variant="outline" data-testid="otp-request-btn" onClick={requestOtp} disabled={busy} className="rounded-none shrink-0">
                    Send OTP
                  </Button>
                </div>
                {otpSent && (
                  <div className="flex gap-2">
                    <Input data-testid="otp-code" placeholder={`Demo OTP: ${otpSent}`} className="rounded-none"
                      value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />
                    <Button type="button" data-testid="otp-verify-btn" onClick={doOtpVerify} disabled={busy} className="rounded-none shrink-0">
                      Verify
                    </Button>
                  </div>
                )}
              </div>

              <Button type="button" variant="outline" data-testid="google-login-btn" onClick={googleLogin}
                className="w-full rounded-none mt-4 h-11 font-meta text-[11px]">
                Continue with Google
              </Button>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={doRegister} className="space-y-4" data-testid="register-form">
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_CARDS.map((r) => (
                    <button
                      type="button"
                      key={r.value}
                      data-testid={`role-card-${r.value}`}
                      onClick={() => setRegForm({ ...regForm, role: r.value })}
                      className={`border p-3 text-left transition-colors ${
                        regForm.role === r.value ? "border-primary bg-primary/5" : "border-border/60 hover:border-foreground/40"
                      }`}
                    >
                      <r.icon className="h-4 w-4 mb-2" />
                      <p className="font-display font-bold text-sm">{r.label}</p>
                      <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                    </button>
                  ))}
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Full name / brand name</Label>
                  <Input data-testid="reg-name" required className="rounded-none mt-1"
                    value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="font-meta text-[10px]">Email</Label>
                    <Input data-testid="reg-email" type="email" required className="rounded-none mt-1"
                      value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} />
                  </div>
                  <div>
                    <Label className="font-meta text-[10px]">Mobile (optional)</Label>
                    <Input data-testid="reg-mobile" className="rounded-none mt-1"
                      value={regForm.mobile} onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="font-meta text-[10px]">Password</Label>
                  <Input data-testid="reg-password" type="password" required minLength={6} className="rounded-none mt-1"
                    value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} />
                </div>
                <Button data-testid="register-submit" disabled={busy} className="w-full rounded-none font-meta text-[11px] h-11">
                  {busy ? "Creating..." : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Link2() {
  return (
    <img
      src="https://images.unsplash.com/photo-1785084288792-51e64dccb318?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMHBhaW50aW5nJTIwZ2FsbGVyeXxlbnwwfHx8fDE3ODY5OTQ4ODZ8MA&ixlib=rb-4.1.0&q=85"
      alt=""
      className="absolute inset-0 h-full w-full object-cover opacity-30"
    />
  );
}

export function AuthCallback() {
  const { googleSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const sessionId = new URLSearchParams(hash.replace("#", "")).get("session_id");
    if (!sessionId) {
      toast.error("Missing session");
      navigate("/auth");
      return;
    }
    googleSession(sessionId)
      .then(() => {
        toast.success("Signed in with Google");
        navigate("/", { replace: true });
      })
      .catch((e) => {
        toast.error(fmtErr(e));
        navigate("/auth");
      });
  }, [googleSession, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="font-meta text-xs text-muted-foreground" data-testid="auth-callback-loading">Signing you in...</p>
    </div>
  );
}
