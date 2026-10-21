"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type AlertRow = {
  id: string;
  product_key: string;
  product_name: string;
  shade_name: string | null;
  created_at: string | null;
};

export default function RestockAlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/product-restock-alerts")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("Sign in to see your restock alerts.");
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load alerts.");
        setAlerts(data.alerts ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load alerts."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Restock alerts</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Products you asked to hear about when they are back.</p>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#C06C84]" /></div>
        ) : error ? (
          <p className="mt-6 text-sm text-red-600">{error}</p>
        ) : alerts.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-muted)]">No pending alerts.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-2xl border border-[var(--border-soft)] bg-white p-4">
                <Link href={`/products/${encodeURIComponent(alert.product_key)}`} className="font-semibold text-[var(--text-main)]">
                  {alert.product_name}
                </Link>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {alert.shade_name ? alert.shade_name : "Any shade"}
                  {alert.created_at ? ` · ${new Date(alert.created_at).toLocaleDateString()}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
