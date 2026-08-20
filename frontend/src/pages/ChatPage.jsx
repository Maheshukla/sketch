import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Headset } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/cards";

export default function ChatPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const activeId = params.get("thread");

  const loadThreads = useCallback(() =>
    api.get("/chat/threads").then((r) => setThreads(r.data)).catch(() => {}), []);

  const loadThread = useCallback((tid) => {
    if (!tid) return;
    api.get(`/chat/threads/${tid}`).then((r) => setActive(r.data)).catch(() => setActive(null));
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    loadThread(activeId);
    const t = setInterval(() => {
      loadThread(activeId);
      loadThreads();
    }, 5000);
    return () => clearInterval(t);
  }, [activeId, loadThread, loadThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages?.length]);

  const openSupportChat = async () => {
    try {
      const { data } = await api.post("/chat/threads", { kind: "support" });
      setParams({ thread: data.id });
      loadThreads();
    } catch (e) {
      toast.error(fmtErr(e));
    }
  };

  const send = async () => {
    if (!text.trim() || !active) return;
    setBusy(true);
    try {
      await api.post(`/chat/threads/${active.id}/messages`, { text });
      setText("");
      loadThread(active.id);
      loadThreads();
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  const threadTitle = (t) =>
    t.kind === "support"
      ? (["support", "admin", "super_admin"].includes(user?.role) ? `Support — ${t.user_name || "user"}` : "Sketch Support")
      : `${t.title} · ${t.buyer_id === user?.id ? t.seller_name : t.buyer_name}`;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12" data-testid="chat-page">
      <PageHeader kicker="Messages" title="Live chat." sub="Talk to sellers about orders, or reach Sketch Support directly." />

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <aside className="border border-border/60" data-testid="chat-thread-list">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <p className="font-meta text-[10px] text-muted-foreground">Conversations</p>
            <button data-testid="chat-new-support" onClick={openSupportChat}
              className="flex items-center gap-1.5 font-meta text-[9px] text-primary hover:underline">
              <Headset className="h-3.5 w-3.5" /> Support
            </button>
          </div>
          <div className="max-h-[520px] overflow-y-auto" data-lenis-prevent>
            {threads.map((t) => (
              <button key={t.id} data-testid={`chat-thread-${t.id}`} onClick={() => setParams({ thread: t.id })}
                className={`w-full text-left px-4 py-3 border-b border-border/40 transition-colors ${activeId === t.id ? "bg-secondary/60" : "hover:bg-secondary/30"}`}>
                <p className="font-display font-bold text-sm truncate">{threadTitle(t)}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {t.last_sender ? `${t.last_sender}: ` : ""}{t.last_message || "No messages yet"}
                </p>
              </button>
            ))}
            {!threads.length && (
              <p className="px-4 py-8 text-xs text-muted-foreground" data-testid="chat-threads-empty">
                No conversations yet. Start one from an order or ping support.
              </p>
            )}
          </div>
        </aside>

        <section className="border border-border/60 flex flex-col" data-testid="chat-window">
          {!active ? (
            <EmptyState testid="chat-empty" title="Select a conversation" hint="Order chats open from the order details page." />
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                <p className="font-display font-bold" data-testid="chat-active-title">{threadTitle(active)}</p>
                <span className="font-meta text-[9px] text-muted-foreground">{active.kind}</span>
              </div>
              <div className="flex-1 min-h-[320px] max-h-[440px] overflow-y-auto px-5 py-4 space-y-3" data-lenis-prevent data-testid="chat-messages">
                {(active.messages || []).map((m) => {
                  const mine = m.user_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] border px-3 py-2 ${mine ? "border-primary/50 bg-primary/10" : "border-border/60 bg-secondary/40"}`}
                        data-testid={`chat-msg-${m.id}`}>
                        <p className="font-meta text-[8px] text-muted-foreground mb-1">{m.from}{m.staff ? " · support" : ""}</p>
                        <p className="text-sm leading-relaxed">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
                {!active.messages?.length && (
                  <p className="text-xs text-muted-foreground text-center py-10">Say hello — messages sync every few seconds.</p>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-2 px-5 py-4 border-t border-border/60">
                <Input data-testid="chat-input" className="rounded-none" placeholder="Write a message..."
                  value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()} />
                <Button data-testid="chat-send" onClick={send} disabled={busy || !text.trim()} className="rounded-none font-meta text-[10px] px-6">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
