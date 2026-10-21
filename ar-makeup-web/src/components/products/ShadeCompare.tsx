"use client";

import { useEffect, useMemo, useState } from "react";
import { MakeupProduct, ProductShade } from "@/src/types/catalog";
import { useMakeupBag } from "@/src/hooks/useMakeupBag";
import { useWishlist } from "@/src/hooks/useWishlist";
import { useSession } from "@/src/hooks/useSession";
import { supabase } from "@/src/lib/supabase/client";

function safeHex(hex?: string | null) {
  if (!hex) return null;
  const h = hex.trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(h)) return h.startsWith("#") ? h : `#${h}`;
  return null;
}

export default function ShadeCompare({
  product,
  shades,
}: {
  product: MakeupProduct;
  shades: ProductShade[];
}) {
  const { status } = useSession();
  const { isInBag } = useMakeupBag();
  const { isWished } = useWishlist();
  const [open, setOpen] = useState(false);
  const [leftKey, setLeftKey] = useState(shades[0]?.shade_key ?? "");
  const [rightKey, setRightKey] = useState(shades[1]?.shade_key ?? shades[0]?.shade_key ?? "");
  const [finishByShade, setFinishByShade] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("product_shades")
      .select("shade_key, finish")
      .eq("product_key", product.product_key)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const next: Record<string, string> = {};
        for (const row of data as { shade_key?: string; finish?: string | null }[]) {
          if (row.shade_key && row.finish?.trim()) next[row.shade_key] = row.finish.trim();
        }
        setFinishByShade(next);
      });
    return () => {
      cancelled = true;
    };
  }, [product.product_key]);

  const left = useMemo(() => shades.find((shade) => shade.shade_key === leftKey) ?? shades[0], [shades, leftKey]);
  const right = useMemo(
    () => shades.find((shade) => shade.shade_key === rightKey) ?? shades[1] ?? shades[0],
    [shades, rightKey],
  );

  if (shades.length < 2 || !left || !right) return null;

  const signedIn = status === "signed_in";
  const stock = product.stock_quantity > 0 ? `In stock (${product.stock_quantity})` : "Out of stock";
  const price = typeof product.price === "number" ? `$${product.price.toFixed(2)}` : "Price unavailable";

  function column(shade: ProductShade) {
    const hex = safeHex(shade.shade_hex);
    const finish = finishByShade[shade.shade_key];
    return (
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-4">
        <div className="flex items-center gap-3">
          <span
            className="h-10 w-10 rounded-full border border-black/10"
            style={{ background: hex ?? "transparent" }}
            aria-hidden
          />
          <div>
            <p className="font-semibold text-[var(--text-main)]">{shade.shade_name}</p>
            <p className="text-xs text-[var(--text-muted)]">{hex ?? "No hex"}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm text-[var(--text-secondary)]">
          {finish ? (
            <div className="flex justify-between gap-3">
              <dt>Finish</dt>
              <dd className="font-medium text-[var(--text-main)]">{finish}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt>Price</dt>
            <dd className="font-medium text-[var(--text-main)]">{price}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Stock</dt>
            <dd className="font-medium text-[var(--text-main)]">{stock}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>In your bag</dt>
            <dd className="font-medium text-[var(--text-main)]">
              {signedIn ? (isInBag(product.product_key, shade.shade_key) ? "Yes" : "No") : "Sign in to check"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Favourite</dt>
            <dd className="font-medium text-[var(--text-main)]">
              {isWished(product.product_key, shade.shade_key) ? "Yes" : "No"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
      >
        {open ? "Hide shade compare" : "Compare two shades"}
      </button>
      {open ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              First shade
              <select
                className="mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-main)]"
                value={left.shade_key}
                onChange={(event) => setLeftKey(event.target.value)}
              >
                {shades.map((shade) => (
                  <option key={shade.shade_key} value={shade.shade_key}>
                    {shade.shade_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              Second shade
              <select
                className="mt-1 w-full rounded-xl border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-main)]"
                value={right.shade_key}
                onChange={(event) => setRightKey(event.target.value)}
              >
                {shades.map((shade) => (
                  <option key={shade.shade_key} value={shade.shade_key}>
                    {shade.shade_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {column(left)}
            {column(right)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
