"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Eye, Filter, RefreshCw } from "lucide-react";
import useSWR from "swr";
import { supabase } from "@/src/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  created_at: string;
  status: string;
  shipping_name: string;
  guest_email?: string;
  total: number;
  currency: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  "placed",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
] as const;

type OrderStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_STYLES: Record<OrderStatus | string, string> = {
  paid:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped:    "bg-blue-50   text-blue-700   border-blue-200",
  delivered:  "bg-purple-50 text-purple-700 border-purple-200",
  cancelled:  "bg-red-50    text-red-600    border-red-200",
  failed:     "bg-red-50    text-red-600    border-red-200",
  placed:     "bg-amber-50  text-amber-700  border-amber-200",
  processing: "bg-sky-50    text-sky-700    border-sky-200",
};

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw new Error("Session fetch failed");
  if (!session?.access_token) throw new Error("No active session");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    "/api/admin/orders",
    fetcher,
    { revalidateOnFocus: false }
  );

  const orders: Order[] = data?.orders ?? [];

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showNotification("Session expired. Please log in again.", "error");
        return;
      }

      // Optimistic update
      mutate(
        {
          ...data,
          orders: orders.map((o) =>
            o.id === orderId ? { ...o, status: newStatus } : o
          ),
        },
        false
      );

      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      });

      const result = await res.json();
      if (result.success) {
        showNotification("Order status updated successfully.", "success");
      } else {
        showNotification("Failed to update status.", "error");
        mutate(); // Revert
      }
    } catch {
      showNotification("Network error. Please try again.", "error");
      mutate();
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      o.id.toLowerCase().includes(q) ||
      (o.shipping_name ?? "").toLowerCase().includes(q) ||
      (o.guest_email ?? "").toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "All" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">

      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium transition-all duration-300 ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              notification.type === "success" ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {notification.message}
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">
          Order Management
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Track and update customer orders from placement to delivery.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by Order ID, name, or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] transition-shadow"
          />
        </div>
        <div className="relative min-w-[190px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] appearance-none bg-white capitalize transition-shadow"
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => mutate()}
          className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-400 hover:text-[#C06C84]"
          title="Refresh orders"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-base)] border-b border-gray-100">
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-6">
                      <div className="h-3 bg-gray-100 rounded w-24 mb-2" />
                      <div className="h-2.5 bg-gray-100 rounded w-16" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-3 bg-gray-100 rounded w-28 mb-2" />
                      <div className="h-2.5 bg-gray-100 rounded w-36" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-3 bg-gray-100 rounded w-16" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-6 bg-gray-100 rounded-lg w-24" />
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="h-7 bg-gray-100 rounded-lg w-16 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-red-400 text-sm">
                    Failed to load orders. Please try refreshing.
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 text-sm">
                    No orders match your search.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const statusStyle =
                    STATUS_STYLES[order.status] ??
                    "bg-gray-50 text-gray-600 border-gray-200";
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <p className="font-mono text-xs text-[var(--text-main)] font-medium">
                          #{order.id.split("-")[0].toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString(
                            "en-US",
                            { day: "numeric", month: "short", year: "numeric" }
                          )}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm font-medium text-[var(--text-main)]">
                          {order.shipping_name || "Guest"}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {order.guest_email || "No email"}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <span className="text-sm font-semibold text-[var(--text-main)]">
                          ${Number(order.total).toFixed(2)}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">
                          {order.currency}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleStatusChange(order.id, e.target.value)
                          }
                          disabled={updatingId === order.id}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] capitalize transition-all cursor-pointer ${statusStyle} ${
                            updatingId === order.id
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() =>
                            router.push(`/admin/orders/${order.id}`)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-[#C06C84] hover:bg-[#F4C2C2]/30 rounded-lg transition-colors"
                          aria-label="View order details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!isLoading && !error && filteredOrders.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">
              Showing {filteredOrders.length} of {orders.length} orders
            </p>
          </div>
        )}
      </div>
    </div>
  );
}