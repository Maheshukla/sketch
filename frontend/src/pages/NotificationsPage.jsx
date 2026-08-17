import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/cards";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/notifications").then((r) => setItems(r.data));
    api.post("/notifications/read").then(() => refresh());
  }, []);

  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-8 py-12" data-testid="notifications-page">
      <PageHeader kicker="Activity" title="Notifications." />
      {!items.length ? (
        <EmptyState testid="notifications-empty" title="All quiet" hint="Follows, orders and request updates land here." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button key={n.id} data-testid={`notification-${n.id}`} onClick={() => n.link && navigate(n.link)}
              className={`w-full text-left border p-4 flex gap-4 items-start transition-colors hover:border-foreground/40 ${n.read ? "border-border/40" : "border-primary/50 bg-primary/5"}`}>
              <Bell className={`h-4 w-4 mt-0.5 shrink-0 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
              <div>
                <p className="text-sm">{n.message}</p>
                <p className="font-meta text-[9px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
