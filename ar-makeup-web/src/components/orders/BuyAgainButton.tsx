"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { addToCart } from "@/src/store/cart";

type ValidItem = {
  product_key: string;
  shade_key?: string | null;
  shade_name?: string | null;
  quantity: number;
  name: string;
  brand: string | null;
  image_url: string | null;
  price: number;
};

type Props = {
  orderId: string;
  itemId?: string;
  label?: string;
  className?: string;
};

export default function BuyAgainButton({ orderId, itemId, label = "Buy again", className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function buyAgain() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/buy-again`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId ? { item_id: itemId } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not validate this purchase.");

      const items = (data.items ?? []) as ValidItem[];
      items.forEach((item) => addToCart({
        product_key: item.product_key,
        shade_key: item.shade_key ?? "no-shade",
        shade_name: item.shade_name ?? "No Shade",
        quantity: item.quantity,
        name: item.name,
        brand: item.brand,
        price: item.price,
        image_url: item.image_url,
      }));

      const unavailable = data.unavailable?.length ?? 0;
      if (items.length === 0) {
        setMessage("This item is currently unavailable.");
      } else if (unavailable > 0) {
        setMessage(`${items.length} item added; ${unavailable} unavailable.`);
      } else {
        setMessage("Added to cart.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not buy again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={buyAgain}
        disabled={loading}
        className={className || "inline-flex items-center gap-1.5 rounded-full border border-[#C06C84]/30 bg-[#F4C2C2]/20 px-3 py-1.5 text-xs font-medium text-[#C06C84] hover:bg-[#C06C84] hover:text-white disabled:opacity-60"}
      >
        <ShoppingCart size={13} />
        {loading ? "Checking…" : label}
      </button>
      {message && <span className="max-w-[220px] text-right text-[11px] text-[var(--text-muted)]">{message}</span>}
    </div>
  );
}
