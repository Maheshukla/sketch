import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, Heart, LayoutDashboard, LogOut, Menu, Moon, Package, Plus, Search, ShoppingBag, Store, Sun, User, Users, LifeBuoy, Shield, Settings, Bookmark, Brush, Clapperboard, Image, Grid, Home, Compass, Store as ShopIcon, BadgeCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/App";
import { toast } from "sonner";
import api, { fmtErr, fileUrl } from "@/lib/api";
import { CATEGORIES } from "@/components/CategoryBar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const SELLER_ROLES = ["artist", "retailer", "company_owner", "company_admin", "company_artist"];
const STAFF = ["super_admin", "admin", "support"];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) {
      navigate(`/marketplace?q=${encodeURIComponent(q.trim())}`);
      setMenuOpen(false);
    }
  };

  const becomeRetailer = async () => {
    try {
      await api.post("/users/me/become-retailer");
      toast.success("You're now a retailer — open Studio to list products");
      window.location.reload();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const go = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isSeller = user && SELLER_ROLES.includes(user.role);

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-border/60 bg-white/70 dark:bg-black/60 backdrop-blur-xl" data-testid="navbar">
      <div className="h-full max-w-[1600px] mx-auto px-4 sm:px-8 flex items-center gap-4">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="mobile-menu-btn" className="rounded-none lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="rounded-none w-80 p-0 overflow-y-auto" data-testid="mobile-menu">
            <SheetHeader className="p-5 border-b border-border/60">
              <SheetTitle className="font-display text-xl font-black tracking-tighter text-left">
                Sketch<span className="text-primary">.</span>
              </SheetTitle>
            </SheetHeader>
            <form onSubmit={submitSearch} className="p-4 border-b border-border/60 sm:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input data-testid="mobile-search-input" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Search artwork, creators..."
                  className="w-full h-10 pl-9 pr-3 bg-secondary/60 border border-border/60 text-sm outline-none" />
              </div>
            </form>
            <nav className="py-2">
              <MenuItem testid="m-home" icon={Home} label="Home" onClick={() => go("/")} />
              <MenuItem testid="m-discover" icon={Compass} label="Discover" onClick={() => go("/")} />
              <MenuItem testid="m-reels" icon={Clapperboard} label="Reels" onClick={() => go("/reels")} />
              <MenuItem testid="m-marketplace" icon={ShopIcon} label="Marketplace" onClick={() => go("/marketplace")} />
              <button data-testid="m-categories" onClick={() => setCatsOpen(!catsOpen)}
                className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-secondary/60 transition-colors">
                <Grid className="h-4 w-4 text-muted-foreground" /> Categories
                <ChevronDown className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${catsOpen ? "rotate-180" : ""}`} />
              </button>
              {catsOpen && (
                <div className="bg-secondary/30 border-y border-border/40">
                  {CATEGORIES.map((c) => (
                    <button key={c} data-testid={`m-cat-${c.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => go(`/marketplace?category=${encodeURIComponent(c)}`)}
                      className="w-full text-left px-10 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <MenuItem testid="m-wishlist" icon={Heart} label="Wishlist" onClick={() => go("/wishlist")} />
              <MenuItem testid="m-cart" icon={ShoppingBag} label="Cart" onClick={() => go("/cart")} />
              <MenuItem testid="m-notifications" icon={Bell} label="Notifications" onClick={() => go("/notifications")}
                badge={user?.unread_notifications} />
              <MenuItem testid="m-orders" icon={Package} label="Orders" onClick={() => go("/orders")} />
              <MenuItem testid="m-saved" icon={Bookmark} label="Saved reels" onClick={() => go("/saved")} />
              <MenuItem testid="m-support" icon={LifeBuoy} label="Support" onClick={() => go("/support")} />
              <MenuItem testid="m-settings" icon={Settings} label="Settings" onClick={() => go("/settings")} />
              {user && (
                <>
                  <div className="mx-5 my-3 border-t border-border/60" />
                  <p className="px-5 pb-1 font-meta text-[9px] text-muted-foreground">Creator space</p>
                  <MenuItem testid="m-profile" icon={User} label="Profile" onClick={() => go(`/profile/${user.id}`)} />
                  <MenuItem testid="m-portfolio" icon={Image} label="My Portfolio" onClick={() => go(`/profile/${user.id}?tab=portfolio`)} />
                  <MenuItem testid="m-my-reels" icon={Clapperboard} label="My Reels" onClick={() => go(`/profile/${user.id}?tab=reels`)} />
                  {isSeller && (
                    <>
                      <MenuItem testid="m-my-artwork" icon={Brush} label="My Artwork" onClick={() => go("/studio?tab=portfolio")} />
                      <MenuItem testid="m-my-products" icon={Store} label="My Products" onClick={() => go("/studio?tab=listings")} />
                    </>
                  )}
                  <MenuItem testid="m-custom-requests" icon={Plus} label="My Custom Requests" onClick={() => go("/custom-orders")} />
                  {!user.company_id && <MenuItem testid="m-create-company" icon={Users} label="Create Company" onClick={() => go("/company")} />}
                  {user.role === "customer" && <MenuItem testid="m-become-retailer" icon={BadgeCheck} label="Become a Retailer" onClick={becomeRetailer} />}
                  {STAFF.includes(user.role) && <MenuItem testid="m-admin" icon={Shield} label="Admin panel" onClick={() => go("/admin")} />}
                  <div className="mx-5 my-3 border-t border-border/60" />
                  <MenuItem testid="m-logout" icon={LogOut} label="Logout" onClick={async () => { await logout(); go("/auth"); }} />
                </>
              )}
              {!user && <MenuItem testid="m-signin" icon={User} label="Sign in" onClick={() => go("/auth")} />}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" data-testid="nav-logo" className="font-display text-2xl font-black tracking-tighter shrink-0">
          Sketch<span className="text-primary">.</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-5 font-meta text-[11px] text-muted-foreground shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="nav-categories" className="flex items-center gap-1 hover:text-foreground transition-colors outline-none">
                Categories <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="rounded-none w-52 max-h-80 overflow-y-auto">
              {CATEGORIES.map((c) => (
                <DropdownMenuItem key={c} data-testid={`nav-cat-${c.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => navigate(`/marketplace?category=${encodeURIComponent(c)}`)}>
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/" data-testid="nav-discover" className="hover:text-foreground transition-colors">Discover</Link>
          <Link to="/reels" data-testid="nav-reels" className="hover:text-foreground transition-colors">Reels</Link>
          <Link to="/marketplace" data-testid="nav-marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
        </nav>

        <form onSubmit={submitSearch} className="flex-1 max-w-xl mx-auto hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              data-testid="nav-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artwork, artists, companies, supplies..."
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
              <Button variant="ghost" size="icon" data-testid="nav-wishlist" className="rounded-none hidden sm:flex relative" onClick={() => navigate("/wishlist")}>
                <Heart className="h-4 w-4" />
                {user.wishlist_count > 0 && (
                  <span data-testid="nav-wishlist-badge" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 bg-foreground text-background text-[10px] font-bold flex items-center justify-center">
                    {user.wishlist_count}
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="icon" data-testid="nav-cart" className="rounded-none relative" onClick={() => navigate("/cart")}>
                <ShoppingBag className="h-4 w-4" />
                {user.cart_count > 0 && (
                  <span data-testid="nav-cart-badge" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {user.cart_count}
                  </span>
                )}
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
                  <DropdownMenuItem data-testid="menu-saved" onClick={() => navigate("/saved")}>
                    <Bookmark className="h-4 w-4 mr-2" /> Saved reels
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
                  <DropdownMenuItem data-testid="menu-settings" onClick={() => navigate("/settings")}>
                    <Settings className="h-4 w-4 mr-2" /> Settings
                  </DropdownMenuItem>
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

function MenuItem({ icon: Icon, label, onClick, testid, badge }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3 text-sm hover:bg-secondary/60 transition-colors">
      <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      {badge > 0 && (
        <span className="ml-auto h-4 min-w-4 px-1 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{badge}</span>
      )}
    </button>
  );
}

