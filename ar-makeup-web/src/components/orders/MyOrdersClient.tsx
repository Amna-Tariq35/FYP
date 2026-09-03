"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount || 0
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "processing") return "Processing";
  if (s === "shipped") return "Shipped";
  if (s === "delivered") return "Delivered";
  if (s === "failed") return "Failed";
  if (s === "cancelled") return "Cancelled";
  if (s === "draft") return "Draft";
  return "Placed";
}

function statusBadgeClass(status: string) {
  const s = (status || "").toLowerCase();
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium";
  if (s === "paid") return `${base} bg-emerald-100 text-emerald-700`;
  if (s === "processing") return `${base} bg-amber-100 text-amber-700`;
  if (s === "shipped") return `${base} bg-sky-100 text-sky-700`;
  if (s === "delivered") return `${base} bg-violet-100 text-violet-700`;
  if (s === "failed") return `${base} bg-red-100 text-red-600`;
  if (s === "cancelled") return `${base} bg-gray-100 text-gray-500`;
  if (s === "draft") return `${base} bg-gray-100 text-gray-400`;
  return `${base} bg-[#F4C2C2]/60 text-[#C06C84]`;
}

function statusDotColor(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "bg-emerald-500";
  if (s === "processing") return "bg-amber-400";
  if (s === "shipped") return "bg-sky-500";
  if (s === "delivered") return "bg-violet-500";
  if (s === "failed") return "bg-red-500";
  if (s === "cancelled") return "bg-gray-400";
  return "bg-[#C06C84]";
}

type OrderRow = {
  id: string;
  status: string;
  currency: string;
  total: number;
  subtotal: number;
  shipping_fee: number;
  created_at: string;
  shipping_name: string;
  shipping_city: string;
};

type OrdersResponse = {
  orders: OrderRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

type MyOrdersClientProps = {
  initialData?: OrdersResponse | null;
};

export default function MyOrdersClient({ initialData }: MyOrdersClientProps) {
  const router = useRouter();

  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const [loading, setLoading] = useState(initialData ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrdersResponse | null>(initialData ?? null);

  const pageSize = 10;

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("pageSize", String(pageSize));
    if (status) sp.set("status", status);
    return sp.toString();
  }, [page, status]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders?${queryString}`);
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/auth/sign-in?next=/my-orders");
        return;
      }

      if (!res.ok) {
        setError(json?.error || "Failed to load orders.");
        setLoading(false);
        return;
      }

      setData(json as OrdersResponse);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Network error.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialData && page === 1 && status === "") {
      return;
    }
    void load();
  }, [queryString]);

  const orders = data?.orders || [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[var(--text-main)]">My Orders</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Track your makeup orders from placement to delivery.
          </p>
        </div>

        <div className="mt-6 ui-section p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex overflow-x-auto pb-1 sm:pb-0 items-center gap-1.5 hide-scrollbar">
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setPage(1); setStatus(value); }}
                  className={[
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    status === value
                      ? "border-[#C06C84] bg-[#C06C84] text-white shadow-sm"
                      : "border-black/10 bg-white/60 text-black/60 hover:border-black/20 hover:text-black/80",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="ui-btn-secondary whitespace-nowrap shrink-0"
              onClick={() => router.push("/products")}
            >
              Continue shopping
            </button>
          </div>

          <div className="ui-divider mt-3" />

          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#C06C84]/30 border-t-[#C06C84]" />
              <p className="text-sm text-[var(--text-muted)]">Loading your orders…</p>
            </div>
          ) : error ? (
            <div
              className="rounded-2xl border p-5"
              style={{
                borderColor: "color-mix(in srgb, #FDA29B 55%, var(--border-soft))",
                background: "color-mix(in srgb, #FDA29B 10%, white)",
              }}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--text-main)]">
                    Couldn't load orders
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{error}</div>
                  <button className="ui-btn mt-3" onClick={load}>
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F4C2C2]/30">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M20 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z" stroke="#C06C84" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="#C06C84" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-main)]">
                  No orders found
                </div>
                <div className="mt-1 text-sm text-[var(--text-muted)] max-w-xs mx-auto">
                  {status === ""
                    ? "Once you place an order, it will appear here."
                    : `You don't have any orders with status "${statusLabel(status)}".`}
                </div>
              </div>
              <button className="ui-btn mt-1" onClick={() => router.push("/products")}> 
                Browse products
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="group rounded-2xl border p-4 sm:p-5 transition-all hover:border-[#C06C84]/30 hover:shadow-sm"
                  style={{ borderColor: "var(--border-soft)", background: "white" }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={statusBadgeClass(o.status)}>
                          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotColor(o.status)}`} />
                          {statusLabel(o.status)}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatDate(o.created_at)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-[var(--text-secondary)]">
                        <span className="font-medium text-[var(--text-main)]">Ship to:</span>{" "}
                        {o.shipping_name}
                        {o.shipping_city ? (
                          <span className="text-[var(--text-muted)]"> · {o.shipping_city}</span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                        <span className="font-mono bg-black/5 px-1.5 py-0.5 rounded-md">{o.id}</span>
                      </div>
                    </div>

                    <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <div className="text-lg font-bold text-[var(--text-main)]">
                        {formatMoney(o.total, o.currency)}
                      </div>

                      <button
                        type="button"
                        className="rounded-full border border-[#C06C84]/30 bg-[#F4C2C2]/20 px-3.5 py-1.5 text-xs font-medium text-[#C06C84] transition-all hover:bg-[#C06C84] hover:text-white hover:border-[#C06C84]"
                        onClick={() => router.push(`/my-orders/${o.id}`)}
                      >
                        View details →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && data && data.totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <button
                className="ui-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>

              <div className="text-sm text-[var(--text-muted)]">
                Page <span className="font-semibold text-[var(--text-main)]">{data.page}</span> of <span className="font-semibold text-[var(--text-main)]">{data.totalPages}</span>
              </div>

              <button
                className="ui-btn-secondary"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      ` }} />
    </div>
  );
}
