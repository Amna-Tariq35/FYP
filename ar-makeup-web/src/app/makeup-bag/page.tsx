"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { supabase } from "@/src/lib/supabase/client";
import { useMakeupBag } from "@/src/hooks/useMakeupBag";
import { useSession } from "@/src/hooks/useSession";
import { addToCart } from "@/src/store/cart";
import type { MakeupProduct, ProductShade } from "@/src/types/catalog";
import { bagItemKey } from "@/src/lib/makeup-bag/keys";

const UNKNOWN_SHADE_NAME = "Shade unavailable";

// Only the columns the catalog list & owned-products queries actually select.
// Kept narrower than MakeupProduct on purpose — avoids over-fetching and
// avoids the "types don't sufficiently overlap" cast error.
type CatalogFields =
  | "product_key"
  | "name"
  | "brand"
  | "category"
  | "image_url"
  | "price"
  | "is_active"
  | "main_category";

type CatalogListItem = Pick<MakeupProduct, CatalogFields>;

type OwnedProductFields =
  | "product_key"
  | "name"
  | "brand"
  | "category"
  | "image_url"
  | "price"
  | "is_active";

type OwnedProductItem = Pick<MakeupProduct, OwnedProductFields>;

function sourceLabel(source?: string) {
  if (source === "purchase") return "From purchase";
  if (source === "try_on") return "From try-on";
  return "Added by you";
}

function MakeupBagContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { items, loading, removeItem, addItem, isInBag, isSignedIn } =
    useMakeupBag();

  const [products, setProducts] = useState<OwnedProductItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogListItem[]>([]);
  const [shadeNames, setShadeNames] = useState<Map<string, string>>(new Map());
  const [shadeHex, setShadeHex] = useState<Map<string, string>>(new Map());
  const [addingOpen, setAddingOpen] = useState(searchParams.get("add") === "1");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedShades, setExpandedShades] = useState<ProductShade[]>([]);
  const [shadesLoading, setShadesLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed_out") {
      router.replace("/auth/sign-in?next=/makeup-bag");
    }
  }, [status, router]);

  useEffect(() => {
    async function loadCatalog() {
      const { data } = await supabase
        .from("makeup_products")
        .select(
          "product_key,name,brand,category,image_url,price,is_active,main_category",
        )
        .eq("is_active", true)
        .eq("main_category", "makeup")
        .order("name");
      if (data) setCatalog(data as CatalogListItem[]);
    }
    if (isSignedIn) loadCatalog();
  }, [isSignedIn]);

  useEffect(() => {
    async function loadOwnedProducts() {
      if (items.length === 0) {
        setProducts([]);
        return;
      }
      const keys = Array.from(new Set(items.map((i) => i.product_key)));
      const { data } = await supabase
        .from("makeup_products")
        .select("product_key,name,brand,category,image_url,price,is_active")
        .in("product_key", keys);
      if (data) setProducts(data as OwnedProductItem[]);
    }
    loadOwnedProducts();
  }, [items]);

  useEffect(() => {
    async function loadShades() {
      const pairs = items.filter((i) => i.shade_key);
      if (pairs.length === 0) {
        setShadeNames(new Map());
        setShadeHex(new Map());
        return;
      }
      const { data } = await supabase
        .from("product_shades")
        .select("product_key,shade_key,shade_name,shade_hex")
        .in(
          "product_key",
          Array.from(new Set(pairs.map((i) => i.product_key))),
        );
      const names = new Map<string, string>();
      const hex = new Map<string, string>();
      for (const row of data ?? []) {
        const k = bagItemKey(row.product_key, row.shade_key);
        names.set(k, row.shade_name);
        if (row.shade_hex) hex.set(k, row.shade_hex);
      }
      setShadeNames(names);
      setShadeHex(hex);
    }
    loadShades();
  }, [items]);

  const productMap = useMemo(() => {
    const map = new Map<string, OwnedProductItem>();
    for (const p of products) map.set(p.product_key, p);
    return map;
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        p.product_key.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, category]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const refill = useCallback(
    (product: OwnedProductItem | undefined, shadeKey: string, shadeName?: string) => {
      if (!product) return;
      addToCart({
        product_key: product.product_key,
        shade_key: shadeKey,
        shade_name: shadeName,
        quantity: 1,
        name: product.name,
        brand: product.brand ?? undefined,
        price: product.price ?? undefined,
        image_url: product.image_url ?? undefined,
      });
      showToast("Added to cart — refill ready");
    },
    [],
  );

  const openShades = async (productKey: string) => {
    if (expandedKey === productKey) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(productKey);
    setShadesLoading(true);
    const { data } = await supabase
      .from("product_shades")
      .select("shade_key,product_key,shade_name,shade_hex")
      .eq("product_key", productKey)
      .order("shade_name");
    setExpandedShades((data ?? []) as ProductShade[]);
    setShadesLoading(false);
  };

  if (status === "loading" || (isSignedIn && loading && items.length === 0)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[#C06C84]" size={32} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-24">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[#C06C84]">
            OWNED, NOT WISHED
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1F1F1F]">
            My Makeup Bag
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#8A8A8A]">
            Wishlist is what you want. Cart is what you are buying. This bag is
            what you actually own — use it in try-on to build looks from your
            real makeup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddingOpen((v) => !v)}
          className="rounded-xl bg-[#C06C84] px-5 py-3 text-sm font-bold text-white hover:brightness-95"
        >
          {addingOpen ? "Close catalog" : "Add products"}
        </button>
      </div>

      {addingOpen && (
        <div className="mb-10 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A]"
              />
              <input
                className="ui-input w-full pl-9"
                placeholder="Search name, brand…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="ui-input w-full sm:w-48"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-[480px] space-y-2 overflow-y-auto">
            {filteredCatalog.slice(0, 80).map((p) => (
              <div
                key={p.product_key}
                className="rounded-xl border border-black/5 p-3"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => openShades(p.product_key)}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-[#FBF7F4]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[#8A8A8A]">
                      {p.brand}
                    </div>
                    <div className="truncate text-sm font-semibold text-[#1F1F1F]">
                      {p.name}
                    </div>
                  </div>
                  <Plus size={16} className="text-[#C06C84]" />
                </button>
                {expandedKey === p.product_key && (
                  <div className="mt-3 flex flex-wrap gap-2 pl-15">
                    {shadesLoading ? (
                      <Loader2 className="animate-spin text-[#C06C84]" size={16} />
                    ) : expandedShades.length === 0 ? (
                      <button
                        type="button"
                        className="rounded-full bg-[#FDF2F4] px-3 py-1 text-xs font-semibold text-[#C06C84]"
                        onClick={async () => {
                          await addItem(p.product_key, "", "manual");
                          showToast("Added to bag");
                        }}
                      >
                        Add product
                      </button>
                    ) : (
                      expandedShades.map((s) => {
                        const owned = isInBag(s.product_key, s.shade_key);
                        return (
                          <button
                            key={s.shade_key}
                            type="button"
                            disabled={owned}
                            onClick={async () => {
                              await addItem(s.product_key, s.shade_key, "manual");
                              showToast(`${s.shade_name} added`);
                            }}
                            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                              owned
                                ? "bg-[#F4C2C2]/40 text-[#C06C84] ring-[#C06C84]/20"
                                : "bg-white text-[#1F1F1F] ring-black/10 hover:ring-[#C06C84]/50"
                            }`}
                          >
                            <span
                              className="h-3 w-3 rounded-full ring-1 ring-black/10"
                              style={{ background: s.shade_hex || "#ccc" }}
                            />
                            {s.shade_name}
                            {owned ? <Check size={12} /> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
          <div className="mb-6 rounded-full bg-white p-6 shadow-sm ring-1 ring-black/5">
            <ShoppingBag size={48} className="text-[#C06C84]/40" />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-[#1F1F1F]">
            Your bag is empty
          </h2>
          <p className="mb-8 text-sm text-[#8A8A8A]">
            Add products you own, or they will appear here automatically after
            a purchase.
          </p>
          <button
            type="button"
            onClick={() => setAddingOpen(true)}
            className="rounded-xl bg-[#C06C84] px-8 py-3.5 text-sm font-bold text-white"
          >
            Add from catalog
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const product = productMap.get(item.product_key);
            const k = bagItemKey(item.product_key, item.shade_key);
            const shadeName = item.shade_key
              ? shadeNames.get(k) ?? UNKNOWN_SHADE_NAME
              : undefined;
            return (
              <div
                key={k}
                className="flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-3"
              >
                {product?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-[#FBF7F4]" />
                )}
                <div
                  className="h-8 w-8 shrink-0 rounded-full ring-2 ring-white shadow"
                  style={{
                    background: shadeHex.get(k) || "#E8D5D5",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-[#8A8A8A]">
                    {product?.brand ?? "—"}
                  </div>
                  <div className="truncate text-sm font-bold text-[#1F1F1F]">
                    {product?.name ?? item.product_key}
                  </div>
                  <div className="text-xs text-[#C06C84]">
                    {shadeName ? shadeName : "All shades"} · {sourceLabel(item.source)}
                  </div>
                </div>
                <button
                  type="button"
                  className="ui-btn-ghost text-xs"
                  onClick={() => refill(product, item.shade_key, shadeName)}
                >
                  Refill
                </button>
                <button
                  type="button"
                  className="rounded-full p-2 text-[#8A8A8A] hover:bg-black/5 hover:text-red-500"
                  aria-label="Remove from bag"
                  onClick={() => removeItem(item.product_key, item.shade_key)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          <div className="pt-4">
            <Link href="/cart" className="ui-btn-secondary inline-flex">
              Go to cart
            </Link>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function MakeupBagPage() {
  return (
    <Suspense fallback={null}>
      <MakeupBagContent />
    </Suspense>
  );
}