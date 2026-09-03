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

  // productKey -> shadeKey (sirf non-empty shade store karo)
  const shadeMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    wishlist.forEach((k) => {
      const [pk, sk] = k.split("__");
      if (sk) map.set(pk, sk);
    });
    return map;
  }, [wishlist]);

  useEffect(() => {
    async function fetchFavourites() {
      if (wishlist.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const productKeys = Array.from(
        new Set(wishlist.map((k) => k.split("__")[0])),
      );
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
  }, [wishlist]);

  // Favourited shades ke human-readable naam resolve karo — cart mein sahi
  // shade_name jaye, "No Shade" jaisi ghalat cheez nahi.
  useEffect(() => {
    async function fetchShadeNames() {
      const pairs = Array.from(shadeMap.entries()) as [string, string][];
      if (pairs.length === 0) {
        setShadeNames(new Map());
        return;
      }

      const productKeys = pairs.map(([pk]) => pk);
      const shadeKeys = Array.from(new Set(pairs.map(([, sk]) => sk)));

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
  }, [shadeMap]);

  // Default: jab bhi favourites list load/change ho, sab products checked
  // hon — chahe user app se aaye ya web se seedha is page pe pahunche.
  useEffect(() => {
    setSelected(new Set(products.map((p) => p.product_key)));
  }, [products]);

  const toggleSelected = useCallback((productKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productKey)) next.delete(productKey);
      else next.add(productKey);
      return next;
    });
  }, []);

  const allSelected = products.length > 0 && selected.size === products.length;

  const toggleSelectAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.product_key)));
  }, [allSelected, products]);

  const cartPayloadFor = useCallback(
    (product: MakeupProduct, quantity = 1) => {
      const shadeKey = shadeMap.get(product.product_key);
      const shadeName = shadeKey
        ? shadeNames.get(shadeMapKey(product.product_key, shadeKey)) ??
          UNKNOWN_SHADE_NAME
        : undefined;

      return {
        product_key: product.product_key,
        shade_key: shadeKey ?? "",
        shade_name: shadeName,
        quantity,
        name: product.name,
        brand: product.brand,
        price: product.price,
        image_url: product.image_url,
      };
    },
    [shadeMap, shadeNames],
  );

  const selectedProducts = useMemo(
    () => products.filter((p) => selected.has(p.product_key)),
    [products, selected],
  );

  const selectedTotal = selectedProducts.reduce(
    (sum, p) => sum + (p.price ?? 0),
    0,
  );

  // Sab selected favourites cart mein daal do aur seedha checkout pe le jao —
  // "Shop All Favourites" (app se yahan aane wala) button ka asli maksad yahi hai.
  const handleAddSelectedToCart = useCallback(() => {
    if (selectedProducts.length === 0) return;
    setAdding(true);
    selectedProducts.forEach((p) => addToCart(cartPayloadFor(p)));
    router.push("/checkout/shipping");
  }, [selectedProducts, cartPayloadFor, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[#C06C84]" size={32} />
      </div>
    );
  }

  if (products.length === 0) {
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
            {products.length} Items
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
        {products.map((product) => {
          const isSelected = selected.has(product.product_key);
          return (
            <div
              key={product.product_key}
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
                  toggleSelected(product.product_key);
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
                isWished={isWished(product.product_key)}
                onWishlistToggle={(pk) => toggle(pk)}
                favShadeKey={shadeMap.get(product.product_key)}
              />
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
                  Checkout
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}