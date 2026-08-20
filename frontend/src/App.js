import "@/index.css";
import { useEffect, useState, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import Lenis from "lenis";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import AuthPage, { AuthCallback } from "@/pages/AuthPage";
import Discover from "@/pages/Discover";
import ReelsPage from "@/pages/ReelsPage";
import Marketplace from "@/pages/Marketplace";
import ProductDetail from "@/pages/ProductDetail";
import ProfilePage from "@/pages/ProfilePage";
import CartPage from "@/pages/CartPage";
import WishlistPage from "@/pages/WishlistPage";
import OrdersPage from "@/pages/OrdersPage";
import CustomOrdersPage from "@/pages/CustomOrdersPage";
import DashboardPage from "@/pages/DashboardPage";
import StudioPage from "@/pages/StudioPage";
import CompanyPage from "@/pages/CompanyPage";
import AdminPage from "@/pages/AdminPage";
import SupportPage from "@/pages/SupportPage";
import NotificationsPage from "@/pages/NotificationsPage";
import SettingsPage from "@/pages/SettingsPage";
import SavedPage from "@/pages/SavedPage";
import EnquiryPage from "@/pages/EnquiryPage";
import VerificationPage from "@/pages/VerificationPage";
import StaticPage from "@/pages/StaticPage";
import OrderDetailPage from "@/pages/OrderDetailPage";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("sketch-theme") || "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("sketch-theme", theme);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
}

function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) return <div className="min-h-screen" />;
  if (user === false) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true });
    return () => lenis.destroy();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="noise-overlay" />
          <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: 0 } }} />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Discover />} />
              <Route path="/reels" element={<ReelsPage />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/profile/:id" element={<ProfilePage />} />
              <Route path="/cart" element={<RequireAuth><CartPage /></RequireAuth>} />
              <Route path="/wishlist" element={<RequireAuth><WishlistPage /></RequireAuth>} />
              <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
              <Route path="/orders/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
              <Route path="/custom-orders" element={<RequireAuth><CustomOrdersPage /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
              <Route path="/studio" element={<RequireAuth roles={["artist", "retailer", "company_owner", "company_admin", "company_artist"]}><StudioPage /></RequireAuth>} />
              <Route path="/company" element={<RequireAuth><CompanyPage /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth roles={["super_admin", "admin", "support"]}><AdminPage /></RequireAuth>} />
              <Route path="/support" element={<RequireAuth><SupportPage /></RequireAuth>} />
              <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
              <Route path="/saved" element={<RequireAuth><SavedPage /></RequireAuth>} />
              <Route path="/enquiry" element={<EnquiryPage />} />
              <Route path="/verification" element={<RequireAuth><VerificationPage /></RequireAuth>} />
              <Route path="/terms" element={<StaticPage kind="terms" />} />
              <Route path="/privacy" element={<StaticPage kind="privacy" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
