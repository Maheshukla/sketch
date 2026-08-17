import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, UserPlus, UserCheck } from "lucide-react";
import api, { fmtErr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCard, EmptyState } from "@/components/cards";
import { CustomRequestDialog } from "@/pages/ReelsPage";

export default function ProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [products, setProducts] = useState([]);
  const [reels, setReels] = useState([]);
  const [showCustom, setShowCustom] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/users/${id}`);
      setProfile(data);
      const prods = await api.get("/products", { params: { seller_id: id } });
      setProducts(prods.data);
      const rls = await api.get("/reels", { params: { creator_id: id } });
      setReels(rls.data);
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
  const name = isCompany ? profile.name : profile.name;
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

  return (
    <div data-testid="profile-page">
      <div className="h-48 sm:h-64 bg-secondary relative overflow-hidden">
        {(profile.banner || profile.avatar) && (
          <img src={fileUrl(profile.banner || profile.avatar)} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 -mt-16 relative z-10 mb-12">
          <div className="h-32 w-32 border-4 border-background bg-secondary overflow-hidden shrink-0">
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
            <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter" data-testid="profile-name">{name}</h1>
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

        <div className="flex gap-10 mb-12" data-testid="profile-stats">
          <Stat label="Followers" value={isCompany ? profile.members?.length : profile.follower_count ?? 0} />
          <Stat label="Works" value={products.length} />
          <Stat label="Reels" value={reels.length} />
        </div>

        <Tabs defaultValue="portfolio" className="mb-20">
          <TabsList className="rounded-none bg-transparent border-b border-border/60 w-full justify-start gap-6 h-auto p-0">
            {["portfolio", "shop", "reels", ...(isCompany ? ["team"] : [])].map((t) => (
              <TabsTrigger key={t} value={t} data-testid={`profile-tab-${t}`}
                className="rounded-none font-meta text-[10px] px-0 pb-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none border-b-2 border-transparent">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="portfolio" className="pt-10">
            {portfolio.length ? (
              <div className="grid grid-cols-12 gap-8" data-testid="portfolio-grid">
                {portfolio.map((item, i) => (
                  <div key={item.id} data-testid={`portfolio-${item.id}`}
                    className={`group cursor-pointer ${i === 0 ? "col-span-12 lg:col-span-8 row-span-2" : "col-span-12 sm:col-span-6 lg:col-span-4"}`}>
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

          <TabsContent value="shop" className="pt-10">
            {products.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {products.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            ) : (
              <EmptyState testid="shop-empty" title="Nothing for sale yet" />
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

          {isCompany && (
            <TabsContent value="team" className="pt-10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {(profile.members || []).map((m) => (
                  <div key={String(m.user_id)} className="border border-border/60 p-5" data-testid={`member-${m.email}`}>
                    <p className="font-display font-bold">{m.name}</p>
                    <p className="font-meta text-[9px] text-muted-foreground mt-1">{m.role}</p>
                    <p className="text-xs text-muted-foreground mt-1">{m.email}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
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
      <p className="font-display text-3xl font-black">{value}</p>
      <p className="font-meta text-[9px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
