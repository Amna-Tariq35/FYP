"use client";

import React, { useEffect, useState } from "react";
import { DollarSign, ShoppingBag, Clock, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";

type StatusStyle = { bg: string; text: string };

function orderStatusStyle(status: string): StatusStyle {
  const s = (status || "").toLowerCase();
  const map: Record<string, StatusStyle> = {
    paid:       { bg: "rgba(34,197,94,0.12)",  text: "#15803d" },
    processing: { bg: "rgba(234,179,8,0.12)",  text: "#a16207" },
    shipped:    { bg: "rgba(59,130,246,0.12)", text: "#1d4ed8" },
    delivered:  { bg: "rgba(168,85,247,0.12)", text: "#7e22ce" },
    cancelled:  { bg: "rgba(0,0,0,0.07)",      text: "#6b7280" },
    failed:     { bg: "rgba(239,68,68,0.12)",  text: "#b91c1c" },
  };
  return map[s] ?? { bg: "rgba(192,108,132,0.12)", text: "#C06C84" };
}

type DashboardStats = {
  totalRevenue: number;
  totalOrders: number;
  pendingOrdersCount: number;
  recentOrders: any[];
};

export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    pendingOrdersCount: 0,
    recentOrders: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch("/api/admin/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (res.ok && data) {
          setStats({
            totalRevenue: data.totalRevenue || 0,
            totalOrders: data.totalOrders || 0,
            pendingOrdersCount: data.pendingOrdersCount || 0,
            recentOrders: data.recentOrders || [],
          });
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--border-soft)", borderTopColor: "var(--rose-primary)" }}
          />
          <p className="text-[13px] text-[var(--text-muted)]">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      Icon: DollarSign,
      accent: "#22c55e",
      accentBg: "rgba(34,197,94,0.10)",
    },
    {
      label: "Total Orders",
      value: String(stats.totalOrders),
      Icon: ShoppingBag,
      accent: "#3b82f6",
      accentBg: "rgba(59,130,246,0.10)",
    },
    {
      label: "Pending Orders",
      value: String(stats.pendingOrdersCount),
      Icon: Clock,
      accent: "#f59e0b",
      accentBg: "rgba(245,158,11,0.10)",
    },
  ];

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-[21px] font-semibold text-[var(--text-main)]">Dashboard</h1>
        <p className="mt-0.5 text-[13px] font-light text-[var(--text-muted)]">
          Real-time overview of your store performance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map(({ label, value, Icon, accent, accentBg }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl border p-5"
            style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
          >
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: accentBg }}
            >
              <Icon size={19} style={{ color: accent }} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--text-muted)]">{label}</p>
              <p className="mt-0.5 text-[22px] font-semibold text-[var(--text-main)] leading-tight">
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
      >
        {/* Table header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border-soft)", background: "var(--bg-base)" }}
        >
          <p className="text-[14px] font-semibold text-[var(--text-main)]">Recent Orders</p>
          <button
            onClick={() => router.push("/admin/orders")}
            className="flex items-center gap-1.5 text-[12.5px] font-medium transition hover:underline"
            style={{ color: "var(--rose-primary)" }}
          >
            View all <ArrowRight size={13} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-soft)", background: "var(--bg-base)" }}>
                {["Order ID", "Customer", "Amount", "Status"].map((col) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-10 text-center text-[13px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No orders yet.
                  </td>
                </tr>
              ) : (
                stats.recentOrders.map((order, idx) => {
                  const { bg, text } = orderStatusStyle(order.status);
                  const isLast = idx === stats.recentOrders.length - 1;
                  return (
                    <tr
                      key={order.id}
                      className="transition hover:bg-[var(--bg-base)]"
                      style={{ borderBottom: isLast ? "none" : "1px solid var(--border-soft)" }}
                    >
                      <td className="px-6 py-4">
                        <span
                          className="font-mono text-[12px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {order.id.split("-")[0]}…
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 text-[13px] font-medium"
                        style={{ color: "var(--text-main)" }}
                      >
                        {order.shipping_name || "Guest"}
                      </td>
                      <td
                        className="px-6 py-4 text-[13px] font-semibold"
                        style={{ color: "var(--text-main)" }}
                      >
                        ${Number(order.total).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
                          style={{ background: bg, color: text }}
                        >
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}