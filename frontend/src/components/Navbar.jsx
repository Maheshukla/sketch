import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Heart, LayoutDashboard, LogOut, Moon, Package, Plus, Search, ShoppingBag, Store, Sun, User, Users, LifeBuoy, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/App";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileUrl } from "@/lib/api";

const SELLER_ROLES = ["artist", "retailer", "company_owner", "company_admin", "company_artist"];
const STAFF = ["super_admin", "admin", "support"];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/marketplace?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-border/60 bg-white/70 dark:bg-black/60 backdrop-blur-xl" data-testid="navbar">
      <div className="h-full max-w-[1600px] mx-auto px-4 sm:px-8 flex items-center gap-6">
        <Link to="/" data-testid="nav-logo" className="font-display text-2xl font-black tracking-tighter shrink-0">
          Sketch<span className="text-primary">.</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 font-meta text-[11px] text-muted-foreground">
          <Link to="/" data-testid="nav-discover" className="hover:text-foreground transition-colors">Discover</Link>
          <Link to="/reels" data-testid="nav-reels" className="hover:text-foreground transition-colors">Reels</Link>
          <Link to="/marketplace" data-testid="nav-marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
        </nav>

        <form onSubmit={submitSearch} className="flex-1 max-w-md hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              data-testid="nav-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artwork, creators, supplies..."
              className="w-full h-9 pl-9 pr-3 bg-secondary/60 border border-border/60 text-sm outline-none focus:border-foreground/40 transition-colors placeholder:text-muted-foreground"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" data-testid="theme-toggle" onClick={toggle} className="rounded-none">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {user ? (
            <>
              <Button variant="ghost" size="icon" data-testid="nav-cart" className="rounded-none" onClick={() => navigate("/cart")}>
                <ShoppingBag className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" data-testid="nav-notifications" className="rounded-none relative" onClick={() => navigate("/notifications")}>
                <Bell className="h-4 w-4" />
                {user.unread_notifications > 0 && (
                  <span data-testid="nav-unread-badge" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {user.unread_notifications}
                  </span>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-testid="nav-user-menu" className="ml-1 outline-none">
                    <Avatar className="h-8 w-8 rounded-none">
                      <AvatarImage src={fileUrl(user.avatar)} />
                      <AvatarFallback className="rounded-none bg-secondary font-display font-bold text-xs">
                        {user.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-none">
                  <div className="px-3 py-2">
                    <p className="font-display font-bold text-sm truncate">{user.name}</p>
                    <p className="font-meta text-[10px] text-muted-foreground">{user.role?.replace("_", " ")}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-profile" onClick={() => navigate(`/profile/${user.id}`)}>
                    <User className="h-4 w-4 mr-2" /> My profile
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-orders" onClick={() => navigate("/orders")}>
                    <Package className="h-4 w-4 mr-2" /> Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-wishlist" onClick={() => navigate("/wishlist")}>
                    <Heart className="h-4 w-4 mr-2" /> Wishlist
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-custom-orders" onClick={() => navigate("/custom-orders")}>
                    <Plus className="h-4 w-4 mr-2" /> Custom orders
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-dashboard" onClick={() => navigate("/dashboard")}>
                    <LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard
                  </DropdownMenuItem>
                  {SELLER_ROLES.includes(user.role) && (
                    <DropdownMenuItem data-testid="menu-studio" onClick={() => navigate("/studio")}>
                      <Store className="h-4 w-4 mr-2" /> Studio
                    </DropdownMenuItem>
                  )}
                  {user.role?.startsWith("company_") && (
                    <DropdownMenuItem data-testid="menu-company" onClick={() => navigate("/company")}>
                      <Users className="h-4 w-4 mr-2" /> Company
                    </DropdownMenuItem>
                  )}
                  {STAFF.includes(user.role) && (
                    <DropdownMenuItem data-testid="menu-admin" onClick={() => navigate("/admin")}>
                      <Shield className="h-4 w-4 mr-2" /> Admin panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem data-testid="menu-support" onClick={() => navigate("/support")}>
                    <LifeBuoy className="h-4 w-4 mr-2" /> Support
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-logout" onClick={async () => { await logout(); navigate("/auth"); }}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button data-testid="nav-signin" onClick={() => navigate("/auth")} className="rounded-none font-meta text-[11px] h-9">
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
