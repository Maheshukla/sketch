import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, UserPlus, UserCheck, Star } from "lucide-react";
import api, { fmtErr, fileUrl, inr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCard, EmptyState } from "@/components/cards";
import { CustomRequestDialog } from "@/pages/ReelsPage";

export default function ProfilePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [products, setProducts] = useState([]);
  const [reels, setReels] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showCustom, setShowCustom] = useState(false);
  const tab = params.get("tab") || "posts";

  const load = async () => {
    try {
      const { data } = await api.get(`/users/${id}`);
      setProfile(data);
      const prods = await api.get("/products", { params: { seller_id: id } });
      setProducts(prods.data);
      const rls = await api.get("/reels", { params: { creator_id: id } });
      setReels(rls.data);
      const rev = await api.get(`/users/${id}/reviews`);
      setReviews(rev.data);
      if (data.type === "user") {
        const pf = await api.get(`/portfolio/${id}`);
        setPortfolio(pf.data);
      }
    } catch {
      navigate("/");
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!profile) return <div className="min-h-screen" />;

  const isCompany = profile.type === "company";
  const name = profile.name;
  const isSelf = user && user.id === id;

  const follow = async () => {
    if (!user) return navigate("/auth");
    try {
      const { data } = await api.post(`/users/${id}/follow`);
      toast.success(data.following ? "Following" : "Unfollowed");
      load();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const posts = [
    ...portfolio.flatMap((p) => (p.images || []).map((img, i) => ({ key: `pf-${p.id}-${i}`, img, label: p.title, to: null }))),
    ...reels.map((r) => ({ key: `rl-${r.id}`, img: r.media_url, label: r.caption, to: "/reels" })),
  ];

  return (
    <div data-testid="profile-page">
      <div className="h-40 sm:h-64 bg-secondary relative overflow-hidden">
        {(profile.banner || profile.avatar) && (
          <img src={fileUrl(profile.banner || profile.avatar)} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 -mt-14 sm:-mt-16 relative z-10 mb-8">
          <div className="h-28 w-28 sm:h-32 sm:w-32 border-4 border-background bg-secondary overflow-hidden shrink-0">
            {profile.avatar ? (
              <img src={fileUrl(profile.avatar)} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center font-display text-4xl font-black">
                {name?.slice(0, 2)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-meta text-[10px] text-primary">
              {isCompany ? "Creative studio" : profile.specialty || profile.role?.replace("_", " ")}
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tighter" data-testid="profile-name">{name}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">{profile.bio || profile.description}</p>
          </div>
          <div className="flex gap-3 shrink-0">
            {!isCompany && !isSelf && (
              <Button data-testid="follow-button" onClick={follow} variant={profile.is_following ? "outline" : "default"}
                className="rounded-none font-meta text-[10px] h-11">
                {profile.is_following ? <UserCheck className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                {profile.is_following ? "Following" : "Follow"}
              </Button>
            )}
            {!isSelf && (
              <Button data-testid="request-custom-button" onClick={() => (user ? setShowCustom(true) : navigate("/auth"))}
                variant="outline" className="rounded-none font-meta text-[10px] h-11">
                <Sparkles className="h-4 w-4 mr-2" /> Commission work
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 sm:flex gap-6 sm:gap-10 mb-10" data-testid="profile-stats">
          <Stat label="Followers" value={isCompany ? profile.members?.length : profile.follower_count ?? 0} />
          <Stat label="Following" value={profile.following_count ?? 0} />
          <Stat label="Orders done" value={profile.orders_completed ?? 0} />
          <Stat label="Profile views" value={profile.portfolio_views ?? 0} />
        </div>

        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} className="mb-20">
          <div className="overflow-x-auto no-scrollbar border-b border-border/60">
            <TabsList className="rounded-none bg-transparent w-full justify-start gap-6 h-auto p-0 min-w-max">
              {["posts", "reels", "portfolio", "products", "reviews", "about"].map((t) => (
                <TabsTrigger key={t} value={t} data-testid={`profile-tab-${t}`}
                  className="rounded-none font-meta text-[10px] px-0 pb-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none border-b-2 border-transparent">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="posts" className="pt-10">
            {posts.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="posts-grid">
                {posts.map((p) => (
                  <div key={p.key} onClick={() => p.to && navigate(p.to)}
                    className={`group relative overflow-hidden border border-border/60 aspect-square ${p.to ? "cursor-pointer" : ""}`}>
                    <img src={fileUrl(p.img)} alt={p.label} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <p className="text-white text-xs font-display font-bold line-clamp-2">{p.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState testid="posts-empty" title="No posts yet" />
            )}
          </TabsContent>

          <TabsContent value="reels" className="pt-10">
            {reels.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {reels.map((r) => (
                  <div key={r.id} data-testid={`profile-reel-${r.id}`} onClick={() => navigate("/reels")}
                    className="group cursor-pointer relative overflow-hidden border border-border/60 aspect-[9/14]">
                    <img src={fileUrl(r.media_url)} alt={r.caption} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState testid="reels-empty" title="No reels yet" />
            )}
          </TabsContent>

          <TabsContent value="portfolio" className="pt-10">
            {portfolio.length ? (
              <div className="grid grid-cols-12 gap-4 sm:gap-8" data-testid="portfolio-grid">
                {portfolio.map((item, i) => (
                  <div key={item.id} data-testid={`portfolio-${item.id}`}
                    className={`group ${i === 0 ? "col-span-12 lg:col-span-8" : "col-span-12 sm:col-span-6 lg:col-span-4"}`}>
                    <div className="overflow-hidden border border-border/60">
                      <img src={fileUrl(item.images?.[0])} alt={item.title}
                        className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${i === 0 ? "aspect-[16/10]" : "aspect-square"}`} />
                    </div>
                    <p className="font-display font-bold mt-3">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState testid="portfolio-empty" title="No portfolio yet" hint="Portfolio pieces appear here." />
            )}
          </TabsContent>

          <TabsContent value="products" className="pt-10">
            {products.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            ) : (
              <EmptyState testid="shop-empty" title="Nothing for sale yet" />
            )}
          </TabsContent>

          <TabsContent value="reviews" className="pt-10">
            {reviews.length ? (
              <div className="space-y-4 max-w-3xl" data-testid="profile-reviews">
                {reviews.map((r) => (
                  <div key={r.id} className="border border-border/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-sm">{r.user_name}</span>
                      <span className="flex">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />)}</span>
                      <span className="font-meta text-[9px] text-muted-foreground ml-auto">{r.product_title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{r.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState testid="reviews-empty" title="No reviews yet" />
            )}
          </TabsContent>

          <TabsContent value="about" className="pt-10">
            <div className="max-w-2xl space-y-6" data-testid="profile-about">
              <div>
                <p className="font-meta text-[10px] text-muted-foreground mb-2">Bio</p>
                <p className="text-sm leading-relaxed">{profile.bio || profile.description || "—"}</p>
              </div>
              {!isCompany && (
                <div>
                  <p className="font-meta text-[10px] text-muted-foreground mb-2">Specialty</p>
                  <p className="text-sm">{profile.specialty || "—"}</p>
                </div>
              )}
              {isCompany && (
                <div>
                  <p className="font-meta text-[10px] text-muted-foreground mb-3">Team</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(profile.members || []).map((m) => (
                      <div key={m.email} className="border border-border/60 p-4" data-testid={`member-${m.email}`}>
                        <p className="font-display font-bold text-sm">{m.name}</p>
                        <p className="font-meta text-[9px] text-muted-foreground mt-1">{m.role}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="font-meta text-[10px] text-muted-foreground mb-2">Member since</p>
                <p className="text-sm">{profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—"}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CustomRequestDialog open={showCustom} onClose={() => setShowCustom(false)}
        targetId={id} targetType={isCompany ? "company" : "user"} targetName={name} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="font-display text-2xl sm:text-3xl font-black">{value}</p>
      <p className="font-meta text-[9px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
