import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bookmark, ChevronDown, ChevronUp, Flag, Heart, MessageCircle, Send, ShoppingBag, Sparkles, UserPlus, X, Zap } from "lucide-react";
import api, { fmtErr, inr, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ReportDialog } from "@/components/cards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function ReelsPage() {
  const [reels, setReels] = useState([]);
  const patch = (id, updates) =>
    setReels((rs) => rs.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  const [hashtag, setHashtag] = useState("");
  const [skip, setSkip] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const sentinelRef = useRef(null);
  const containerRef = useRef(null);
  const reelRefs = useRef([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const pinnedRef = useRef(false);
  const [autoScroll, setAutoScroll] = useState(() => sessionStorage.getItem("sketch-autoscroll") === "1");
  const { user } = useAuth();

  useEffect(() => {
    if (!pinnedRef.current && reels.length && containerRef.current) {
      containerRef.current.scrollTop = 0;
      setCurrentIdx(0);
      pinnedRef.current = true;
    }
  }, [reels.length]);

  const goTo = (i) => {
    const el = reelRefs.current[i];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleAutoScroll = () => {
    setAutoScroll((v) => {
      sessionStorage.setItem("sketch-autoscroll", v ? "0" : "1");
      return !v;
    });
  };

  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goTo(Math.max(currentIdx - 1, 0));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        goTo(Math.min(currentIdx + 1, reels.length - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIdx, reels.length]);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;
      const best = visible.reduce((a, b) => (b.intersectionRatio > a.intersectionRatio ? b : a));
      const idx = Number(best.target.dataset.idx);
      if (!Number.isNaN(idx)) setCurrentIdx(idx);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], root: containerRef.current });
    reelRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [reels.length]);

  useEffect(() => {
    if (!autoScroll || !reels.length) return;
    if (currentIdx >= reels.length - 1) return;
    const reel = reels[currentIdx];
    if (!reel || reel.media_type === "video") return;
    const t = setTimeout(() => goTo(currentIdx + 1), 8000);
    return () => clearTimeout(t);
  }, [autoScroll, currentIdx, reels]);

  const load = (append = false, tag = hashtag, skipCount = 0) =>
    api.get("/reels", { params: { sort: tag ? "" : "random", hashtag: tag, skip: skipCount, limit: 10 } })
      .then((r) => {
        if (append) {
          setReels((rs) => [...rs, ...r.data.filter((n) => !rs.some((x) => x.id === n.id))]);
          if (!r.data.length) setExhausted(true);
        } else {
          setReels(r.data);
          requestAnimationFrame(() => {
            containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
            setCurrentIdx(0);
            setTimeout(() => containerRef.current?.scrollTo({ top: 0, behavior: "auto" }), 120);
          });
        }
        if (!append && r.data.length < 10) setExhausted(true);
      })
      .catch(() => {});

  useEffect(() => {
    setSkip(0);
    setExhausted(false);
    load(false, hashtag, 0);
  }, [hashtag]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !exhausted) {
        setSkip((s) => {
          const next = s + 10;
          load(true, hashtag, next);
          return next;
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [exhausted, hashtag]);

  return (
    <div className="relative">
      <div className="fixed left-4 sm:left-8 bottom-6 z-40" data-testid="autoscroll-control">
        <button data-testid="autoscroll-toggle" onClick={toggleAutoScroll}
          className={`font-meta text-[9px] px-3 py-2 border backdrop-blur-xl transition-colors ${autoScroll ? "border-primary text-primary bg-black/60" : "border-white/30 text-white/80 bg-black/40"}`}>
          Auto Scroll: {autoScroll ? "ON" : "OFF"}
        </button>
      </div>

      {reels.length > 1 && (
        <div className="fixed right-3 sm:right-6 top-20 z-40 flex flex-col gap-2" data-testid="reel-nav">
          <button data-testid="reel-prev" onClick={() => goTo(Math.max(currentIdx - 1, 0))} disabled={currentIdx === 0}
            className="h-10 w-10 border border-white/30 bg-black/50 backdrop-blur-xl text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors disabled:opacity-30">
            <ChevronUp className="h-5 w-5" />
          </button>
          <span className="font-meta text-[9px] text-white/60 text-center" data-testid="reel-counter">{currentIdx + 1}/{reels.length}</span>
          <button data-testid="reel-next" onClick={() => goTo(Math.min(currentIdx + 1, reels.length - 1))} disabled={currentIdx >= reels.length - 1}
            className="h-10 w-10 border border-white/30 bg-black/50 backdrop-blur-xl text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors disabled:opacity-30">
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}

      <div ref={containerRef} className="reel-snap h-[calc(100vh-4rem)] overflow-y-scroll bg-[#050505]" data-testid="reels-page">
        {hashtag && (
          <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
            <span className="font-meta text-[10px] text-primary" data-testid="hashtag-filter">#{hashtag}</span>
            <button data-testid="clear-hashtag" onClick={() => setHashtag("")} className="font-meta text-[10px] text-white/60 hover:text-white">
              ✕ clear
            </button>
          </div>
        )}
        {reels.map((reel, i) => (
          <ReelItem key={reel.id} reel={reel} user={user} patch={patch} reload={load} onTag={setHashtag}
            idx={i} onVideoEnd={() => autoScroll && goTo(Math.min(i + 1, reels.length - 1))}
            ref={(el) => (reelRefs.current[i] = el)} />
        ))}
        <div ref={sentinelRef} className="h-4" data-testid="reels-sentinel" />
        {!reels.length && (
          <div className="h-[calc(100vh-4rem)] flex items-center justify-center text-white/50 font-meta text-xs">
            No reels yet
          </div>
        )}
      </div>
    </div>
  );
}

function ReelItem({ reel, user, patch, reload, onTag, idx, onVideoEnd, ref }) {
  const navigate = useNavigate();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [dead, setDead] = useState(false);
  const videoRef = useRef(null);

  const needAuth = () => {
    if (!user) {
      navigate("/auth");
      return true;
    }
    return false;
  };

  const act = async (fn) => {
    if (needAuth()) return;
    try {
      await fn();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const like = () =>
    act(async () => {
      const { data } = await api.post(`/reels/${reel.id}/like`);
      patch(reel.id, { liked: data.liked, like_count: reel.like_count + (data.liked ? 1 : -1) });
    });

  const save = () =>
    act(async () => {
      const { data } = await api.post(`/reels/${reel.id}/save`);
      patch(reel.id, { saved: data.saved, save_count: reel.save_count + (data.saved ? 1 : -1) });
      toast.success(data.saved ? "Saved" : "Removed from saved");
    });

  const share = () =>
    act(async () => {
      await api.post(`/reels/${reel.id}/share`);
      patch(reel.id, { shares: reel.shares + 1 });
      await navigator.clipboard?.writeText(window.location.href).catch(() => {});
      toast.success("Link copied");
    });

  const follow = () =>
    act(async () => {
      const { data } = await api.post(`/users/${reel.creator_id}/follow`);
      toast.success(data.following ? `Following ${reel.creator_name}` : "Unfollowed");
    });

  const openComments = async () => {
    setShowComments(true);
    const { data } = await api.get(`/reels/${reel.id}/comments`);
    setComments(data);
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    await act(async () => {
      await api.post(`/reels/${reel.id}/comments`, { text: commentText });
      setCommentText("");
      const { data } = await api.get(`/reels/${reel.id}/comments`);
      setComments(data);
      patch(reel.id, { comment_count: reel.comment_count + 1 });
    });
  };

  const addCart = () =>
    act(async () => {
      await api.post("/cart", { product_id: reel.product.id, qty: 1 });
      toast.success("Added to cart");
    });

  const buyNow = () =>
    act(async () => {
      await api.post("/cart", { product_id: reel.product.id, qty: 1 });
      navigate("/cart");
    });

  if (dead) return null;

  return (
    <section ref={ref} data-idx={idx} className="relative h-[calc(100vh-4rem)] w-full flex items-center justify-center overflow-hidden" data-testid={`reel-${reel.id}`}>
      <div className="absolute inset-0">
        {reel.media_type === "video" ? (
          <video ref={videoRef} src={fileUrl(reel.media_url)} className="h-full w-full object-cover" autoPlay loop={!onVideoEnd} muted playsInline
            onEnded={onVideoEnd}
            onError={() => setDead(true)} />
        ) : (
          <img src={fileUrl(reel.media_url)} alt={reel.caption} className="h-full w-full object-cover kenburns"
            onError={() => setDead(true)} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
      </div>

      <div className="absolute bottom-0 left-0 p-6 sm:p-10 max-w-lg text-white z-10">
        <button
          data-testid={`reel-creator-${reel.id}`}
          onClick={() => navigate(`/profile/${reel.creator_id}`)}
          className="font-display font-bold text-lg hover:text-primary transition-colors"
        >
          {reel.creator_name}
        </button>
        <p className="text-white/80 text-sm mt-2 leading-relaxed">{reel.caption}</p>
        {(reel.caption.match(/#\w+/g) || []).length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2" data-testid={`reel-hashtags-${reel.id}`}>
            {(reel.caption.match(/#\w+/g) || []).map((t) => (
              <button key={t} data-testid={`hashtag-${t.slice(1)}`} onClick={() => onTag?.(t.slice(1))}
                className="font-meta text-[10px] text-primary hover:underline">
                {t}
              </button>
            ))}
          </div>
        )}

        {reel.product && (
          <div className="mt-5 bg-white/10 backdrop-blur-xl border border-white/20 p-4 max-w-sm" data-testid={`reel-product-${reel.id}`}>
            <div className="flex gap-3 items-center">
              <img src={fileUrl(reel.product.image)} alt="" className="h-14 w-14 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-sm truncate">{reel.product.title}</p>
                <p className="font-meta text-[10px] text-white/70">{inr(reel.product.price)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button data-testid={`reel-buy-now-${reel.id}`} onClick={buyNow} className="rounded-none font-meta text-[10px] h-9">
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Buy now
              </Button>
              <Button data-testid={`reel-add-cart-${reel.id}`} onClick={addCart} variant="outline"
                className="rounded-none font-meta text-[10px] h-9 bg-transparent text-white border-white/40 hover:bg-white hover:text-black">
                <ShoppingBag className="h-3.5 w-3.5 mr-1.5" /> Add to cart
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-4 sm:right-8 bottom-24 flex flex-col items-center gap-5 text-white z-10">
        <RailBtn testid={`reel-like-${reel.id}`} onClick={like} active={reel.liked} icon={<Heart className={`h-6 w-6 ${reel.liked ? "fill-primary text-primary" : ""}`} />} count={reel.like_count} />
        <RailBtn testid={`reel-comment-${reel.id}`} onClick={openComments} icon={<MessageCircle className="h-6 w-6" />} count={reel.comment_count} />
        <RailBtn testid={`reel-share-${reel.id}`} onClick={share} icon={<Send className="h-6 w-6" />} count={reel.shares} />
        <RailBtn testid={`reel-save-${reel.id}`} onClick={save} active={reel.saved} icon={<Bookmark className={`h-6 w-6 ${reel.saved ? "fill-white" : ""}`} />} count={reel.save_count} />
        {reel.creator_type !== "company" && (
          <RailBtn testid={`reel-follow-${reel.id}`} onClick={follow} icon={<UserPlus className="h-6 w-6" />} />
        )}
        <RailBtn testid={`reel-custom-${reel.id}`} onClick={() => (needAuth() ? null : setShowCustom(true))} icon={<Sparkles className="h-6 w-6 text-primary" />} />
        <RailBtn testid={`reel-report-${reel.id}`} onClick={() => (needAuth() ? null : setShowReport(true))} icon={<Flag className="h-5 w-5" />} />
      </div>

      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="rounded-none max-w-md" data-testid={`comments-dialog-${reel.id}`}>
          <DialogHeader>
            <DialogTitle className="font-display">Comments</DialogTitle>
            <DialogDescription className="sr-only">Read and post comments on this reel</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-4 py-2">
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-display font-bold mr-2">{c.user_name}</span>
                <span className="text-muted-foreground">{c.text}</span>
              </div>
            ))}
            {!comments.length && <p className="text-sm text-muted-foreground">Be the first to comment.</p>}
          </div>
          <div className="flex gap-2">
            <Input data-testid={`comment-input-${reel.id}`} value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..." className="rounded-none" onKeyDown={(e) => e.key === "Enter" && postComment()} />
            <Button data-testid={`comment-post-${reel.id}`} onClick={postComment} className="rounded-none">Post</Button>
          </div>
        </DialogContent>
      </Dialog>

      <CustomRequestDialog open={showCustom} onClose={() => setShowCustom(false)}
        targetId={reel.creator_id} targetType={reel.creator_type === "company" ? "company" : "user"}
        targetName={reel.creator_name} />
      <ReportDialog open={showReport} onClose={() => setShowReport(false)} targetType="reel" targetId={reel.id} />
    </section>
  );
}

function RailBtn({ icon, count, onClick, testid, active }) {
  return (
    <button data-testid={testid} onClick={onClick} className={`flex flex-col items-center gap-1 transition-transform hover:scale-110 ${active ? "" : ""}`}>
      <span className="h-11 w-11 bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center">{icon}</span>
      {count !== undefined && <span className="font-meta text-[9px] text-white/80">{count}</span>}
    </button>
  );
}

export function CustomRequestDialog({ open, onClose, targetId, targetType, targetName }) {
  const [form, setForm] = useState({ title: "", description: "", budget: "", deadline: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Give your request a title");
    setBusy(true);
    try {
      await api.post("/custom-requests", {
        target_id: targetId, target_type: targetType,
        title: form.title, description: form.description,
        budget: parseFloat(form.budget) || 0, deadline: form.deadline,
      });
      toast.success("Request submitted — the platform will review it");
      onClose();
      setForm({ title: "", description: "", budget: "", deadline: "" });
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="rounded-none max-w-lg" data-testid="custom-request-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Request custom work from {targetName}</DialogTitle>
          <DialogDescription className="sr-only">Submit a custom artwork commission request</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="font-meta text-[10px]">Project title</Label>
            <Input data-testid="cr-title" className="rounded-none mt-1" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Anniversary portrait, 16x20" />
          </div>
          <div>
            <Label className="font-meta text-[10px]">Describe your vision</Label>
            <Textarea data-testid="cr-description" className="rounded-none mt-1" rows={4} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Style, size, medium, references..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-meta text-[10px]">Budget (₹)</Label>
              <Input data-testid="cr-budget" type="number" className="rounded-none mt-1" value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </div>
            <div>
              <Label className="font-meta text-[10px]">Needed by</Label>
              <Input data-testid="cr-deadline" type="date" className="rounded-none mt-1" value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <Button data-testid="cr-submit" onClick={submit} disabled={busy} className="w-full rounded-none font-meta text-[11px] h-11">
            {busy ? "Submitting..." : "Submit request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
