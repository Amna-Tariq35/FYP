"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/src/store/cart";
import type { SavedShadeMatch } from "@/src/app/api/account/shade-match/route";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "signed-out" }
  | { status: "empty" }
  | { status: "ready"; shades: SavedShadeMatch[] };

export default function ShadeMatchCard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [addedKey, setAddedKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/shade-match", { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (response.status === 401) {
          setState({ status: "signed-out" });
          return;
        }
        if (!response.ok) {
          setState({ status: "error", message: "Could not load your shade match." });
          return;
        }
        const shades = readShades(body);
        setState(shades.length === 0 ? { status: "empty" } : { status: "ready", shades });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Could not load your shade match." });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-white p-5 sm:col-span-2 lg:col-span-3">
      <h2 className="font-semibold text-[var(--text-main)]">Your shade match</h2>
      {state.status === "loading" && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Loading your shade match…</p>
      )}
      {state.status === "error" && (
        <p className="mt-2 text-sm text-[var(--text-muted)]" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "signed-out" && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          <Link href="/auth/sign-in?next=/account" className="font-semibold text-[#C06C84]">
            Sign in
          </Link>{" "}
          to see a shade saved from the app.
        </p>
      )}
      {state.status === "empty" && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Find your foundation shade in the Android app
        </p>
      )}
      {state.status === "ready" && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.shades.map((shade) => {
            const productKey = shade.productKey;
            const rowKey = `${productKey ?? "shade"}-${shade.shadeKey ?? shade.shadeName}`;
            return (
              <li key={rowKey} className="flex gap-3 rounded-xl border border-[var(--border-soft)] p-3">
                <span
                  className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-full border border-black/10"
                  style={{ background: shade.shadeHex ?? "#f3e6ea" }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-main)]">{shade.shadeName}</p>
                  {shade.brand && (
                    <p className="truncate text-xs text-[var(--text-muted)]">{shade.brand}</p>
                  )}
                  {shade.productName && (
                    <p className="truncate text-xs text-[var(--text-muted)]">{shade.productName}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {productKey && (
                      <Link
                        href={`/products/${encodeURIComponent(productKey)}${shade.shadeKey ? `?shade=${encodeURIComponent(shade.shadeKey)}` : ""}`}
                        className="text-xs font-semibold text-[#C06C84]"
                      >
                        View product
                      </Link>
                    )}
                    {shade.inStock && productKey && (
                      <button
                        type="button"
                        className="rounded-full bg-[#C06C84] px-3 py-1 text-xs font-semibold text-white"
                        onClick={() => {
                          addToCart({
                            product_key: productKey,
                            shade_key: shade.shadeKey ?? "no-shade",
                            shade_name: shade.shadeName,
                            quantity: 1,
                            name: shade.productName ?? shade.shadeName,
                            brand: shade.brand ?? undefined,
                            price: shade.price ?? undefined,
                            image_url: shade.imageUrl ?? undefined,
                          });
                          setAddedKey(rowKey);
                        }}
                      >
                        {addedKey === rowKey ? "Added" : "Add to cart"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function readShades(body: unknown): SavedShadeMatch[] {
  if (!body || typeof body !== "object" || !("shades" in body)) return [];
  const shades = (body as { shades?: unknown }).shades;
  if (!Array.isArray(shades)) return [];
  return shades.filter(isSavedShade);
}

function isSavedShade(value: unknown): value is SavedShadeMatch {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SavedShadeMatch>;
  return typeof row.shadeName === "string" && typeof row.inStock === "boolean";
}
