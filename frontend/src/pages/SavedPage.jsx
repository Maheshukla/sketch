import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clapperboard } from "lucide-react";
import api, { fileUrl } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/cards";

export default function SavedPage() {
  const [reels, setReels] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/reels", { params: { saved: true } }).then((r) => setReels(r.data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="saved-page">
      <PageHeader kicker="Saved" title="Saved reels." sub="Reels you bookmarked — tap any to jump back into the feed." />
      {!reels.length ? (
        <EmptyState testid="saved-empty" title="Nothing saved yet" hint="Tap the bookmark icon on any reel to save it here." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {reels.map((r) => (
            <div key={r.id} data-testid={`saved-reel-${r.id}`} onClick={() => navigate("/reels")}
              className="group cursor-pointer relative overflow-hidden border border-border/60 aspect-[9/14]">
              <img src={fileUrl(r.media_url)} alt={r.caption} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-0 p-3 text-white">
                <span className="flex items-center gap-1 font-meta text-[8px] text-white/70 mb-1">
                  <Clapperboard className="h-3 w-3" /> {r.creator_name}
                </span>
                <p className="font-display font-bold text-xs leading-snug line-clamp-2">{r.caption}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
