"use client";

import { useMemo, useState, useEffect } from "react";
import { MakeupProduct, ProductShade } from "@/src/types/catalog";
import { addToCart } from "@/src/store/cart";
import { Check, Heart } from "lucide-react";
import { useWishlist } from "@/src/hooks/useWishlist"; // 🆕 Import Hook
import { useSearchParams } from "next/navigation"; // 🆕 add karo

type Props = {
  product: MakeupProduct;
  shades: ProductShade[];
};

function safeHex(hex: string | null) {
  if (!hex) return null;
  const h = hex.trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(h)) return h.startsWith("#") ? h : `#${h}`;
  return null;
}

export default function AddToCartPanel({ product, shades }: Props) {
  const searchParams = useSearchParams(); // 🆕
  const { toggle, isWished, wishlist } = useWishlist(); // 🆕 wishlist bhi nikalo

  const [selectedShadeKey, setSelectedShadeKey] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const hasShades = shades.length > 0;
  const selectedShade = useMemo(
    () => shades.find((s) => s.shade_key === selectedShadeKey) ?? null,
    [selectedShadeKey, shades],
  );

  // 🆕 Shade preselect: URL param > favorited shade > kuch nahi
  useEffect(() => {
    const shadeFromUrl = searchParams.get("shade");
    if (shadeFromUrl && shades.some((s) => s.shade_key === shadeFromUrl)) {
      setSelectedShadeKey(shadeFromUrl);
      return;
    }

    // Agar URL mein shade nahi hai, to is product ki favorited shade dhundo
    const favoritedEntry = wishlist.find((k) =>
      k.startsWith(`${product.product_key}__`),
    );
    if (favoritedEntry) {
      const [, sk] = favoritedEntry.split("__");
      if (sk && shades.some((s) => s.shade_key === sk)) {
        setSelectedShadeKey(sk);
      }
    }
  }, [searchParams, wishlist, product.product_key, shades]);
  const canAdd = !hasShades || !!selectedShade;
  const isCurrentlyWished = isWished(product.product_key, selectedShadeKey); // 🆕 Check status

  function handleAdd() {
    if (!canAdd) return;
    addToCart({
      product_key: product.product_key,
      shade_key: selectedShade?.shade_key ?? "no-shade",
      shade_name: selectedShade?.shade_name ?? "No Shade",
      quantity,
      name: product.name,
      brand: product.brand,
      price: product.price,
      image_url: product.image_url,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)] p-6 space-y-6">
      {/* ── Shade selector (Unchanged) ── */}
      {hasShades && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Shade
            </p>
            {selectedShade && (
              <p className="text-[12.5px] font-medium text-[var(--text-main)]">
                {selectedShade.shade_name}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {shades.map((shade) => {
              const active = shade.shade_key === selectedShadeKey;
              const hex = safeHex(shade.shade_hex);
              return (
                <button
                  key={shade.shade_key}
                  type="button"
                  onClick={() => setSelectedShadeKey(shade.shade_key)}
                  title={shade.shade_name}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
                    active
                      ? "border-[var(--rose-primary)] bg-[var(--rose-primary)]/8 text-[var(--text-main)] shadow-sm"
                      : "border-[var(--border-soft)] bg-white text-[var(--text-muted)] hover:border-[var(--rose-primary)]/50",
                  ].join(" ")}
                >
                  <span
                    className="h-3 w-3 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: hex ?? "transparent" }}
                    aria-hidden
                  />
                  <span className="max-w-[130px] truncate">
                    {shade.shade_name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quantity (Unchanged) ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">
          Quantity
        </p>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity === 1}
            className={[
              "h-8 w-8 rounded-lg border text-base font-medium transition flex items-center justify-center select-none",
              quantity === 1
                ? "cursor-not-allowed border-[var(--border-soft)] text-black/20"
                : "border-[var(--border-soft)] hover:border-[var(--rose-primary)] hover:text-[var(--rose-primary)] text-[var(--text-main)]",
            ].join(" ")}
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-semibold text-[var(--text-main)] tabular-nums">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="h-8 w-8 rounded-lg border border-[var(--border-soft)] hover:border-[var(--rose-primary)] hover:text-[var(--rose-primary)] text-[var(--text-main)] transition flex items-center justify-center select-none text-base font-medium"
          >
            +
          </button>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="flex items-center gap-3">
        {/* Heart Toggle */}
        <button
          type="button"
          onClick={() => toggle(product.product_key, selectedShadeKey)}
          className={[
            "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
            isCurrentlyWished
              ? "border-[var(--rose-primary)] bg-[var(--rose-primary)]/10 text-[var(--rose-primary)]"
              : "border-[var(--border-soft)] bg-white text-[var(--text-muted)] hover:border-[var(--rose-primary)]/50",
          ].join(" ")}
          aria-label="Toggle favourite"
        >
          <Heart
            size={20}
            className={
              isCurrentlyWished ? "fill-current text-[var(--rose-primary)]" : ""
            }
          />
        </button>

        {/* Add to Cart */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className={[
            "flex-1 rounded-xl py-3 text-sm font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-2",
            added
              ? "bg-[var(--rose-primary)]/90 text-white"
              : canAdd
                ? "bg-[var(--rose-primary)] text-white hover:brightness-95 active:scale-[0.99]"
                : "bg-[var(--rose-soft)] text-white/70 cursor-not-allowed",
          ].join(" ")}
        >
          {added ? (
            <>
              <Check size={15} strokeWidth={2.5} />
              Added to cart
            </>
          ) : canAdd ? (
            "Add to cart"
          ) : (
            "Select a shade to continue"
          )}
        </button>
      </div>
    </div>
  );
}
