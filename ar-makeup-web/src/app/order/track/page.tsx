"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check, Search, Package } from "lucide-react";
import ReceiptSummary from "@/src/components/checkout/ReceiptSummary";

type ReceiptResponse = { order: any; items: any[] };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

type StatusStyle = { bg: string; text: string; dot: string };

function statusStyle(status: string): StatusStyle {
  const s = (status || "").toLowerCase();
  const map: Record<string, StatusStyle> = {
    paid:       { bg: "rgba(34,197,94,0.10)",  text: "#15803d", dot: "#22c55e" },
    processing: { bg: "rgba(234,179,8,0.10)",  text: "#a16207", dot: "#eab308" },
    shipped:    { bg: "rgba(59,130,246,0.10)", text: "#1d4ed8", dot: "#3b82f6" },
    delivered:  { bg: "rgba(168,85,247,0.10)", text: "#7e22ce", dot: "#a855f7" },
    failed:     { bg: "rgba(239,68,68,0.10)",  text: "#b91c1c", dot: "#ef4444" },
    cancelled:  { bg: "rgba(0,0,0,0.06)",      text: "#6b7280", dot: "#9ca3af" },
  };
  return map[s] ?? { bg: "rgba(192,108,132,0.10)", text: "#C06C84", dot: "#C06C84" };
}

function StatusBadge({ status }: { status: string }) {
  const { bg, text, dot } = statusStyle(status);
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold capitalize"
      style={{ background: bg, color: text }}
    >
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
      {label}
    </span>
  );
}

export default function TrackOrderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialToken = params.get("guest_token") || "";

  const [token, setToken] = useState(initialToken);
  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareLink = useMemo(() => {
    const t = token.trim();
    if (!t) return "";
    return `${typeof window !== "undefined" ? window.location.origin : ""}/order/track?guest_token=${encodeURIComponent(t)}`;
  }, [token]);

  useEffect(() => {
    if (initialToken) void fetchReceipt(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchReceipt(t: string) {
    const clean = t.trim();
    setError(null);
    setReceipt(null);

    if (!clean) {
      setError("Please enter your guest token.");
      return;
    }
    if (!isUuid(clean)) {
      setError("Token format is invalid. Please paste the full guest token from your order confirmation.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/guest?guest_token=${encodeURIComponent(clean)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "No order found for this token. Please check and try again.");
        setLoading(false);
        return;
      }

      setReceipt(data as ReceiptResponse);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Network error. Please try again.");
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="mx-auto max-w-5xl px-4 py-12">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-[var(--text-main)]">Track your order</h1>
          <p className="mt-1 text-[13px] font-light text-[var(--text-muted)]">
            Enter your guest token to view your receipt and order status.
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">

          {/* ── Left: Input panel ── */}
          <div className="w-full lg:w-[40%]">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
            >
              <div className="mb-5 flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: "rgba(192,108,132,0.10)", border: "1px solid rgba(192,108,132,0.15)" }}
                >
                  <Search size={15} style={{ color: "var(--rose-primary)" }} />
                </div>
                <p className="text-[14px] font-medium text-[var(--text-main)]">Guest Token</p>
              </div>

              <input
                id="guest_token"
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(null); }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-xl border px-4 py-3 text-[13px] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:font-sans outline-none transition"
                style={{
                  borderColor: error ? "rgba(239,68,68,0.35)" : "var(--border-soft)",
                  background: "var(--bg-base)",
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-2 text-[11.5px] font-light text-[var(--text-muted)]">
                Found in your order confirmation email.
              </p>

              {error && (
                <div
                  className="mt-4 rounded-xl border p-3.5"
                  style={{
                    borderColor: "rgba(239,68,68,0.20)",
                    background: "rgba(239,68,68,0.05)",
                  }}
                  role="alert"
                >
                  <p className="text-[12.5px] font-medium" style={{ color: "#b91c1c" }}>{error}</p>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => fetchReceipt(token)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium text-white transition disabled:opacity-60"
                  style={{ background: "var(--rose-primary)" }}
                >
                  {loading ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Checking…
                    </>
                  ) : (
                    "Track order"
                  )}
                </button>

                <button
                  type="button"
                  className="rounded-xl border px-4 py-2.5 text-[13px] font-medium text-[var(--text-muted)] transition hover:border-[var(--rose-primary)] hover:text-[var(--rose-primary)]"
                  style={{ borderColor: "var(--border-soft)", background: "var(--bg-base)" }}
                  onClick={() => router.push("/products")}
                  disabled={loading}
                >
                  Browse products
                </button>
              </div>

              {/* Status + copy link — only shown after successful load */}
              {receipt?.order && (
                <div
                  className="mt-5 rounded-xl border p-4"
                  style={{ borderColor: "var(--border-soft)", background: "var(--bg-base)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        Status
                      </p>
                      <StatusBadge status={receipt.order.status || "placed"} />
                    </div>

                    {shareLink && (
                      <button
                        type="button"
                        onClick={copyLink}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11.5px] font-medium transition"
                        style={{
                          borderColor: copied ? "rgba(34,197,94,0.35)" : "var(--border-soft)",
                          color: copied ? "#15803d" : "var(--text-muted)",
                          background: copied ? "rgba(34,197,94,0.06)" : "var(--bg-section)",
                        }}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? "Copied" : "Share link"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <p className="mt-4 text-[11px] font-light text-[var(--text-muted)]">
                Guest orders are tracked via token only and do not appear in My Orders.
              </p>
            </div>
          </div>

          {/* ── Right: Receipt panel ── */}
          <div className="flex-1">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
            >
              {!receipt?.order ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border"
                    style={{ background: "rgba(192,108,132,0.07)", borderColor: "rgba(192,108,132,0.12)" }}
                  >
                    <Package size={22} style={{ color: "var(--rose-primary)" }} />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-[var(--text-main)]">Your receipt</p>
                    <p className="mt-1 text-[12.5px] font-light text-[var(--text-muted)]">
                      Enter a valid guest token to view your order receipt here.
                    </p>
                  </div>
                </div>
              ) : (
                <ReceiptSummary order={receipt.order} items={receipt.items || []} />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}