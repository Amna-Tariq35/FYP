"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase/client";
import { useWishlist } from "@/src/hooks/useWishlist";
import ProductCard from "@/src/components/products/ProductCard";
import { MakeupProduct } from "@/src/types/catalog";
import { addToCart } from "@/src/store/cart";
import Link from "next/link";
import { Heart, Loader2, ShoppingBag, Check } from "lucide-react";

/**
 * Shown when a favourited shade no longer matches a `product_shades` row —
 * same reasoning as the Look detail page: the item does have a shade, we
 * just cannot name it, so we must not guess or silently drop it.
 */
const UNKNOWN_SHADE_NAME = "Shade unavailable";

function shadeMapKey(productKey: string, shadeKey: string) {
  return `${productKey}__${shadeKey}`;
}

export default function FavouritesPage() {
  const { wishlist, toggle, isWished } = useWishlist();
  const router = useRouter();

  const [products, setProducts] = useState<MakeupProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [shadeNames, setShadeNames] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const lines = useMemo(() => {
    return wishlist.map((entry) => {
      const splitAt = entry.indexOf("__");
      return {
        key: entry,
        product_key: splitAt === -1 ? entry : entry.slice(0, splitAt),
        shade_key: splitAt === -1 ? "" : entry.slice(splitAt + 2),
      };
    });
  }, [wishlist]);

  useEffect(() => {
    async function fetchFavourites() {
      if (lines.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const productKeys = Array.from(new Set(lines.map((line) => line.product_key)));
      const { data, error } = await supabase
        .from("makeup_products")
        .select("*")
        .in("product_key", productKeys);

      if (data && !error) {
        setProducts(data);
      }
      setLoading(false);
    }

    fetchFavourites();
  }, [lines]);

  // Favourited shades ke human-readable naam resolve karo — cart mein sahi
  // shade_name jaye, "No Shade" jaisi ghalat cheez nahi.
  useEffect(() => {
    async function fetchShadeNames() {
      const pairs = lines.filter((line) => line.shade_key);
      if (pairs.length === 0) {
        setShadeNames(new Map());
        return;
      }

      const productKeys = pairs.map((line) => line.product_key);
      const shadeKeys = Array.from(new Set(pairs.map((line) => line.shade_key)));

      const { data, error } = await supabase
        .from("product_shades")
        .select("product_key,shade_key,shade_name")
        .in("product_key", productKeys)
        .in("shade_key", shadeKeys);

      if (data && !error) {
        const map = new Map<string, string>();
        for (const row of data as {
          product_key: string;
          shade_key: string;
          shade_name: string;
        }[]) {
          map.set(shadeMapKey(row.product_key, row.shade_key), row.shade_name);
        }
        setShadeNames(map);
      }
    }

    fetchShadeNames();
  }, [lines]);

  useEffect(() => {
    setSelected(new Set(lines.map((line) => line.key)));
  }, [lines]);

  const toggleSelected = useCallback((lineKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey);
      else next.add(lineKey);
      return next;
    });
  }, []);

  const allSelected = lines.length > 0 && selected.size === lines.length;

  const toggleSelectAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(lines.map((line) => line.key)));
  }, [allSelected, lines]);

  const productByKey = useMemo(() => {
    const map = new Map<string, MakeupProduct>();
    products.forEach((product) => map.set(product.product_key, product));
    return map;
  }, [products]);

  const cartPayloadFor = useCallback(
    (product: MakeupProduct, shadeKey: string, quantity = 1) => {
      const shadeName = shadeKey
        ? shadeNames.get(shadeMapKey(product.product_key, shadeKey)) ?? UNKNOWN_SHADE_NAME
        : undefined;

      return {
        product_key: product.product_key,
        shade_key: shadeKey,
        shade_name: shadeName,
        quantity,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image_url: product.image_url,
      };
    },
    [shadeNames],
  );

  const selectedLines = useMemo(
    () => lines.filter((line) => selected.has(line.key) && productByKey.has(line.product_key)),
    [lines, selected, productByKey],
  );

  const selectedTotal = selectedLines.reduce((sum, line) => {
    return sum + (productByKey.get(line.product_key)?.price ?? 0);
  }, 0);

  const handleAddSelectedToCart = useCallback(() => {
    if (selectedLines.length === 0) return;
    setAdding(true);
    selectedLines.forEach((line) => {
      const product = productByKey.get(line.product_key);
      if (!product) return;
      addToCart(cartPayloadFor(product, line.shade_key));
    });
    router.push("/cart");
  }, [selectedLines, productByKey, cartPayloadFor, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[#C06C84]" size={32} />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-32 text-center">
        <div className="mb-6 rounded-full bg-white p-6 shadow-sm ring-1 ring-black/5">
          <Heart size={48} className="text-[#C06C84]/40" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-[#1F1F1F]">
          No favourites yet
        </h2>
        <p className="mb-8 text-sm text-[#8A8A8A]">
          Tap the heart icon on products in the store or try-on shades in the AR
          Studio to save your loved items here.
        </p>
        <Link
          href="/products"
          className="rounded-xl bg-[#C06C84] px-8 py-3.5 text-sm font-bold tracking-wide text-white transition-all hover:brightness-95 active:scale-95"
        >
          Explore Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-24">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1F1F]">
            My Favourites
          </h1>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8A8A8A] ring-1 ring-black/5">
            {lines.length} Items
          </span>
        </div>

        <button
          onClick={toggleSelectAll}
          className="text-xs font-semibold text-[#C06C84] underline underline-offset-2 hover:opacity-75"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
        {lines.map((line) => {
          const product = productByKey.get(line.product_key);
          if (!product) return null;
          const isSelected = selected.has(line.key);
          const shadeLabel = line.shade_key
            ? shadeNames.get(shadeMapKey(line.product_key, line.shade_key)) ?? UNKNOWN_SHADE_NAME
            : null;
          return (
            <div
              key={line.key}
              className={`group relative rounded-2xl transition-all ${
                isSelected ? "ring-2 ring-[#C06C84]/70" : "ring-2 ring-transparent"
              }`}
            >
              {/* Selection toggle — sits just under the wishlist heart so it
                  never collides with the top-left category tag or the heart
                  itself, whatever ProductCard's internal layout is. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelected(line.key);
                }}
                aria-pressed={isSelected}
                aria-label={isSelected ? "Deselect item" : "Select item"}
                className={`absolute right-2.5 top-14 z-10 flex h-6 w-6 items-center justify-center rounded-full shadow-sm ring-1 transition-all ${
                  isSelected
                    ? "bg-[#C06C84] ring-[#C06C84]"
                    : "bg-white/95 ring-black/10 hover:ring-[#C06C84]/50"
                }`}
              >
                {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </button>

              <ProductCard
                product={product}
                isWished={isWished(product.product_key, line.shade_key)}
                onWishlistToggle={(pk) => toggle(pk, line.shade_key)}
                favShadeKey={line.shade_key || undefined}
              />
              {shadeLabel ? (
                <p className="px-3 pb-3 text-xs font-medium text-[#C06C84]">{shadeLabel}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Floating summary pill — only appears once something is selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-full bg-white/95 py-2 pl-5 pr-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-md">
            <div className="whitespace-nowrap">
              <p className="text-[11px] font-medium leading-tight text-[#8A8A8A]">
                {selected.size} selected
              </p>
              <p className="text-sm font-bold leading-tight text-[#1F1F1F]">
                ${selectedTotal.toFixed(2)}
              </p>
            </div>
            <button
              onClick={handleAddSelectedToCart}
              disabled={adding}
              className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[#C06C84] px-5 py-2.5 text-xs font-bold text-white transition-all hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Added
                </>
              ) : (
                <>
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Add selected
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}