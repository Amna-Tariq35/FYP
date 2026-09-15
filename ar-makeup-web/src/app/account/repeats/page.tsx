"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart, Loader2, Repeat2 } from "lucide-react";
import { addToCart } from "@/src/store/cart";

type Repeat = {
  product_key: string;
  shade_key: string | null;
  shade_name: string | null;
  purchase_count: number;
  total_quantity: number;
  last_ordered_at: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  price: number | null;
  stock_quantity: number;
  is_active: boolean;
};

export default function RepeatsPage() {
  const [repeats, setRepeats] = useState<Repeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/repeats")
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) throw new Error("Please sign in to view your repeats.");
        if (!response.ok) throw new Error(data.error || "Could not load repeats.");
        setRepeats(data.repeats ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load repeats."))
      .finally(() => setLoading(false));
  }, []);

  function addRepeat(item: Repeat) {
    if (!item.is_active || !item.price || item.stock_quantity < 1) return;
    addToCart({
      product_key: item.product_key,
      shade_key: item.shade_key ?? "no-shade",
      shade_name: item.shade_name ?? "No Shade",
      quantity: 1,
      name: item.name,
      brand: item.brand,
      price: item.price,
      image_url: item.image_url,
    });
    setAdded(item.product_key);
    setTimeout(() => setAdded(null), 1600);
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Repeat2 className="text-[#C06C84]" size={22} />
              <h1 className="text-2xl font-bold text-[var(--text-main)]">Your repeats</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Products you have bought more than once or may be ready to replenish.</p>
          </div>
          <Link href="/my-orders" className="text-sm font-medium text-[#C06C84] hover:underline">View my orders</Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C06C84]" /></div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
        ) : repeats.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-white p-10 text-center">
            <p className="font-semibold text-[var(--text-main)]">No repeat products yet</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Your repeat suggestions will appear after paid orders.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repeats.map((item) => {
              const unavailable = !item.is_active || !item.price || item.stock_quantity < 1;
              return (
                <article key={`${item.product_key}:${item.shade_key ?? ""}`} className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white">
                  <div className="aspect-[4/3] bg-[var(--bg-section)]">
                    {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h2 className="font-semibold text-[var(--text-main)]">{item.name}</h2>
                      <p className="text-xs text-[var(--text-muted)]">{item.brand || ""}{item.shade_name ? ` · ${item.shade_name}` : ""}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>Bought {item.purchase_count}×</span>
                      <span>Stock: {item.stock_quantity}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#C06C84]">{item.price === null ? "Unavailable" : `$${item.price.toFixed(2)}`}</span>
                      <button type="button" disabled={unavailable} onClick={() => addRepeat(item)} className="inline-flex items-center gap-1.5 rounded-full bg-[#C06C84] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
                        <ShoppingCart size={13} /> {added === item.product_key ? "Added" : unavailable ? "Unavailable" : "Add again"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
