"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import {
  CartItem,
  loadCart,
  removeFromCart,
  updateQuantity,
  getCartSubtotal,
} from "@/src/store/cart";
import { getProductImageUrl } from "@/src/lib/catalog/image";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  const refresh = () => {
    const state = loadCart(); // ✅ returns { items: [...] }
    setItems(state.items || []);
  };

  useEffect(() => {
    refresh();

    const handler = () => refresh();
    window.addEventListener("cart_updated", handler);

    return () => window.removeEventListener("cart_updated", handler);
  }, []);

  const subtotal = useMemo(() => getCartSubtotal({ items }), [items]);

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-[var(--bg-base)]">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)] p-10 text-center">
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              Your cart is empty
            </h1>
            <p className="mt-2 text-[var(--text-muted)]">
              Browse products and add your favorite shades.
            </p>

            <Link
              href="/products"
              className="mt-6 inline-flex rounded-xl bg-[var(--rose-primary)] px-5 py-2.5 font-medium text-white hover:opacity-95 transition"
            >
              Browse products
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold text-[var(--text-main)]">Cart</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Review your items before checkout.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Items list */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => {
              const img = getProductImageUrl(item.image_url ?? null);
              const key = `${item.product_key}__${item.shade_key ?? "no-shade"}`;

              const unitPrice =
                typeof item.price === "number" ? item.price : 0;

              const lineTotal = unitPrice * (item.quantity || 0);

              const brandText = item.brand?.trim() ? item.brand : "—";
              const shadeText = item.shade_name?.trim()
                ? item.shade_name
                : "No Shade";

              return (
                <div
                  key={key}
                  className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)] p-4"
                >
                  <div className="flex gap-4">
                    {/* image */}
                    <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-[var(--bg-base)]">
                      <Image
                        src={img}
                        alt={item.name ?? "Product"}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    </div>

                    {/* content */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--text-muted)]">
                            {brandText}
                          </p>
                          <p className="text-lg font-semibold text-[var(--text-main)]">
                            {item.name ?? "Product"}
                          </p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            Shade:{" "}
                            <span className="font-medium">{shadeText}</span>
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            removeFromCart(item.product_key, item.shade_key ?? null);
                            refresh();
                          }}
                          className="text-sm text-[var(--rose-primary)] hover:underline"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        {/* Quantity stepper */}
                        <div className="inline-flex items-center gap-3 rounded-xl border border-[var(--rose-soft)]/60 bg-[var(--bg-section)] px-3 py-2">
                          <button
                            onClick={() => {
                              updateQuantity(
                                item.product_key,
                                item.shade_key ?? null,
                                Math.max(1, (item.quantity || 1) - 1)
                              );
                              refresh();
                            }}
                            disabled={(item.quantity || 1) === 1}
                            className={[
                              "h-9 w-9 rounded-full border transition flex items-center justify-center",
                              (item.quantity || 1) === 1
                                ? "cursor-not-allowed border-[var(--rose-soft)]/40 text-black/30"
                                : "border-[var(--rose-soft)] text-[var(--text-main)] hover:border-[var(--rose-primary)] hover:bg-[var(--rose-primary)]/10",
                            ].join(" ")}
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>

                          <span className="w-6 text-center text-sm font-semibold text-[var(--text-main)]">
                            {item.quantity || 1}
                          </span>

                          <button
                            onClick={() => {
                              updateQuantity(
                                item.product_key,
                                item.shade_key ?? null,
                                (item.quantity || 1) + 1
                              );
                              refresh();
                            }}
                            className="h-9 w-9 rounded-full border border-[var(--rose-soft)] text-[var(--text-main)] transition hover:border-[var(--rose-primary)] hover:bg-[var(--rose-primary)]/10 flex items-center justify-center"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        {/* line total */}
                        <div className="text-right">
                          <p className="text-sm text-[var(--text-muted)]">
                            Total
                          </p>
                          <p className="font-semibold text-[var(--text-main)]">
                            ${lineTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* unit price hint */}
                      {typeof item.price === "number" ? (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Unit price: ${item.price.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)] p-6 h-fit">
            <h2 className="text-lg font-semibold text-[var(--text-main)]">
              Order Summary
            </h2>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Subtotal</span>
              <span className="font-medium text-[var(--text-main)]">
                ${subtotal.toFixed(2)}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">Shipping</span>
              <span className="font-medium text-[var(--text-main)]">—</span>
            </div>

            <div className="mt-4 border-t border-[var(--border-soft)] pt-4 flex items-center justify-between">
              <span className="font-semibold text-[var(--text-main)]">Total</span>
              <span className="font-semibold text-[var(--rose-primary)]">
                ${subtotal.toFixed(2)}
              </span>
            </div>

            <Link
              href="/checkout/shipping"
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-[var(--rose-primary)] py-3 font-medium text-white hover:opacity-95 transition"
            >
              Proceed to checkout
            </Link>

            <Link
              href="/products"
              className="mt-3 flex w-full items-center justify-center rounded-xl border border-[var(--border-soft)] py-3 font-medium text-[var(--text-main)] hover:bg-black/5 transition"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
