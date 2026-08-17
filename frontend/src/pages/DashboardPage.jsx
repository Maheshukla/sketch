import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { inr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard } from "@/components/cards";

const SELLER_ROLES = ["artist", "retailer", "company_owner", "company_admin", "company_artist"];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const isStaff = ["super_admin", "admin", "support"].includes(user?.role);
  const isSeller = SELLER_ROLES.includes(user?.role);

  useEffect(() => {
    if (isSeller) api.get("/analytics/creator").then((r) => setData(r.data));
    else if (isStaff) api.get("/admin/overview").then((r) => setData(r.data));
    else {
      Promise.all([api.get("/orders"), api.get("/wishlist")]).then(([o, w]) =>
        setData({ orders: o.data.length, wishlist: w.data.items.length }));
    }
  }, [isSeller, isStaff]);

  if (!data) return <div className="min-h-screen" />;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12" data-testid="dashboard-page">
      <PageHeader kicker="Dashboard" title={`Hello, ${user.name?.split(" ")[0]}.`}
        sub={isSeller ? "Your creative business at a glance." : isStaff ? "Platform health and moderation queue." : "Your activity on Sketch."} />

      {isSeller && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard testid="stat-earnings" label="Earnings (released)" value={inr(data.earnings)} sub="After 10% platform fee" />
            <StatCard testid="stat-sales" label="Sales volume" value={inr(data.total_sales)} />
            <StatCard testid="stat-orders" label="Orders" value={data.orders} />
            <StatCard testid="stat-followers" label="Followers" value={data.followers} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard testid="stat-products" label="Live products" value={data.products} />
            <StatCard testid="stat-reels" label="Reels" value={data.reels} />
            <StatCard testid="stat-custom" label="Custom requests" value={data.custom_requests} />
            <StatCard testid="stat-fee" label="Platform fee" value="10%" sub="Charged on released payouts" />
          </div>
          <div className="border border-border/60 p-6" data-testid="sales-chart">
            <p className="font-meta text-[10px] text-muted-foreground mb-6">Sales — recent days</p>
            {data.chart?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0 }}
                    formatter={(v) => [inr(v), "Sales"]} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Sales data appears once orders come in.</p>
            )}
          </div>
        </>
      )}

      {isStaff && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard testid="stat-users" label="Users" value={data.users} />
          <StatCard testid="stat-products" label="Products" value={data.products} />
          <StatCard testid="stat-reels" label="Reels" value={data.reels} />
          <StatCard testid="stat-orders" label="Orders" value={data.orders} />
          <StatCard testid="stat-revenue" label="GMV released" value={inr(data.revenue)} />
          <StatCard testid="stat-commission" label="Commission earned" value={inr(data.commission)} />
          <StatCard testid="stat-moderation" label="Pending moderation" value={data.pending_moderation} />
          <StatCard testid="stat-tickets" label="Open tickets" value={data.open_tickets} />
        </div>
      )}

      {!isSeller && !isStaff && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard testid="stat-my-orders" label="My orders" value={data.orders} />
          <StatCard testid="stat-my-wishlist" label="Wishlist items" value={data.wishlist} />
        </div>
      )}
    </div>
  );
}
