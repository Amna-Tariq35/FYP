"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ReceiptSummary from "@/src/components/checkout/ReceiptSummary";

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

// Synced with MyOrdersClient — all statuses covered
function statusLabel(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "paid")        return "Paid";
  if (s === "processing")  return "Processing";
  if (s === "shipped")     return "Shipped";
  if (s === "delivered")   return "Delivered";
  if (s === "failed")      return "Failed";
  if (s === "cancelled")   return "Cancelled";
  if (s === "draft")       return "Draft";
  return "Placed";
}

function statusBadgeClass(status: string) {
  const s = (status || "").toLowerCase();
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium";
  if (s === "paid")        return `${base} bg-emerald-100 text-emerald-700`;
  if (s === "processing")  return `${base} bg-amber-100 text-amber-700`;
  if (s === "shipped")     return `${base} bg-sky-100 text-sky-700`;
  if (s === "delivered")   return `${base} bg-violet-100 text-violet-700`;
  if (s === "failed")      return `${base} bg-red-100 text-red-600`;
  if (s === "cancelled")   return `${base} bg-gray-100 text-gray-500`;
  if (s === "draft")       return `${base} bg-gray-100 text-gray-400`;
  return                          `${base} bg-[#F4C2C2]/60 text-[#C06C84]`;
}

function statusDotColor(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "paid")        return "bg-emerald-500";
  if (s === "processing")  return "bg-amber-400";
  if (s === "shipped")     return "bg-sky-500";
  if (s === "delivered")   return "bg-violet-500";
  if (s === "failed")      return "bg-red-500";
  if (s === "cancelled")   return "bg-gray-400";
  return                          "bg-[#C06C84]";
}

// Which statuses allow cancellation
const CANCELLABLE_STATUSES = ["placed"];

type ReceiptResponse = { order: any; items: any[] };

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function loadReceipt() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace(`/auth/sign-in?next=/my-orders/${encodeURIComponent(orderId)}`);
        return;
      }

      if (!res.ok) {
        setError(data?.error || "Failed to load order.");
        setLoading(false);
        return;
      }

      setReceipt(data as ReceiptResponse);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Network error.");
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const status = useMemo(() => String(receipt?.order?.status || ""), [receipt]);

  const canCancel = useMemo(
    () => CANCELLABLE_STATUSES.includes(status.toLowerCase()),
    [status]
  );

  async function onCancelOrder() {
    setCancelError(null);

    const ok = window.confirm(
      "Cancel this order?\n\nThis will set the status to Cancelled."
    );
    if (!ok) return;

    setCancelLoading(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCancelError(data?.error || "Failed to cancel order.");
        setCancelLoading(false);
        return;
      }

      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, order: data.order };
      });

      setCancelLoading(false);
    } catch (e: any) {
      setCancelError(e?.message || "Network error.");
      setCancelLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10">

        {/* Header */}
        <div className="flex flex-col gap-3">
          <button
            className="flex w-fit items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-xs text-black/60 hover:bg-white/80 hover:text-black transition-all backdrop-blur"
            onClick={() => router.push("/my-orders")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to My Orders
          </button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-main)]">Order details</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                <span className="font-mono bg-black/5 px-1.5 py-0.5 rounded-md text-xs">{orderId}</span>
              </p>
            </div>

            {receipt?.order ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={statusBadgeClass(status)}>
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotColor(status)}`} />
                  {statusLabel(status)}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatDate(receipt.order.created_at)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="ui-section p-8 flex flex-col items-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#C06C84]/30 border-t-[#C06C84]" />
              <div className="text-sm text-[var(--text-muted)]">Loading order…</div>
            </div>

          ) : error ? (
            <div className="ui-section p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-main)]">Couldn't load order</div>
                  <div className="text-sm text-[var(--text-muted)] mt-1">{error}</div>
                  <div className="mt-4 flex gap-3">
                    <button className="ui-btn" onClick={loadReceipt}>Retry</button>
                    <button className="ui-btn-secondary" onClick={() => router.push("/products")}>
                      Continue shopping
                    </button>
                  </div>
                </div>
              </div>
            </div>

          ) : receipt?.order ? (
            <div className="grid gap-4 lg:grid-cols-12">

              {/* Left: actions + meta */}
              <div className="lg:col-span-5 space-y-4">

                {/* Actions card */}
                <div className="ui-section p-6">
                  <div className="text-sm font-semibold text-[var(--text-main)]">Actions</div>
                  <div className="ui-divider" />

                  {cancelError ? (
                    <div
                      className="mb-4 rounded-xl border p-4"
                      style={{
                        borderColor: "color-mix(in srgb, #FDA29B 55%, var(--border-soft))",
                        background: "color-mix(in srgb, #FDA29B 10%, white)",
                      }}
                    >
                      <div className="text-sm font-semibold text-[var(--text-main)]">Cancel failed</div>
                      <div className="text-sm text-[var(--text-muted)] mt-1">{cancelError}</div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    {canCancel ? (
                      <button
                        className="ui-btn"
                        onClick={onCancelOrder}
                        disabled={cancelLoading}
                      >
                        {cancelLoading ? "Cancelling…" : "Cancel order"}
                      </button>
                    ) : (
                      <div className="rounded-xl bg-black/[0.03] border border-black/[0.06] px-4 py-3 text-sm text-[var(--text-muted)] w-full">
                        Cancellation is only available for{" "}
                        <span className="font-medium text-[var(--text-secondary)]">placed orders</span> 
                       
                      </div>
                    )}

                    <button
                      className="ui-btn-secondary"
                      onClick={() => router.push("/products")}
                    >
                      Continue shopping
                    </button>
                  </div>
                </div>

                {/* Order summary card */}
                <div className="ui-section p-6">
                  <div className="text-sm font-semibold text-[var(--text-main)]">Order summary</div>
                  <div className="ui-divider" />
                  <div className="space-y-3">
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Status</span>
                      <span className={statusBadgeClass(status)}>
                        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${statusDotColor(status)}`} />
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="h-px bg-black/[0.05]" />

                    {/* Created row */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Placed</span>
                      <span className="text-sm font-medium text-[var(--text-main)]">
                        {formatDate(receipt.order.created_at)}
                      </span>
                    </div>
                    <div className="h-px bg-black/[0.05]" />

                    {/* Shipping row */}
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-[var(--text-muted)] shrink-0">Ship to</span>
                      <span className="text-sm font-medium text-[var(--text-main)] text-right">
                        {receipt.order.shipping_name}
                        {receipt.order.shipping_city ? (
                          <span className="block text-xs font-normal text-[var(--text-muted)]">
                            {receipt.order.shipping_city}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: receipt */}
              <div className="lg:col-span-7">
                <div className="ui-section p-6">
                  <ReceiptSummary order={receipt.order} items={receipt.items || []} />
                </div>
              </div>
            </div>

          ) : (
            <div className="ui-section p-6">
              <div className="text-sm text-[var(--text-muted)]">Order not found.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}