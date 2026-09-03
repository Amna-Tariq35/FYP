"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { loadCart, getCartCount, getCartSubtotal } from "@/src/store/cart";
import { getProductImageUrl } from "@/src/lib/catalog/image";

type Props = {
  title?: string;
  showShippingNote?: boolean;
};

function formatMoney(amount: number, currency: string = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export default function OrderSummary({
  title = "Order summary",
  showShippingNote = true,
}: Props) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    window.addEventListener("cart_updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("cart_updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const cart = useMemo(() => loadCart(), [version]);
  const count = useMemo(() => getCartCount(cart), [cart]);
  const subtotal = useMemo(() => getCartSubtotal(cart), [cart]);

  const shippingFee = 0;
  const total = subtotal + shippingFee;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text-main)]">
            {title}
          </div>
          <div className="ui-muted mt-1">
            {count} {count === 1 ? "item" : "items"}
          </div>
        </div>
      </div>

      <div className="ui-divider" />

      {/* Items */}
      {count === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4C2C2]/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6h15l-2 9H8L6 6Z"
                stroke="#C06C84"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M6 6 5 3H2"
                stroke="#C06C84"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                stroke="#C06C84"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Your cart is empty. Add products to continue.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {cart.items.map((item) => {
            const qty = item.quantity ?? 1;
            const unit = Number(item.price ?? 0);
            const line = unit * qty;
            const img = getProductImageUrl(item.image_url);

            return (
              <li
                key={`${item.product_key}:${item.shade_key ?? "no-shade"}`}
                className="flex items-start gap-3"
              >
                {/* Image */}
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border"
                  style={{
                    borderColor: "var(--border-soft)",
                    background: "white",
                  }}
                >
                  <Image
                    src={img}
                    alt={item.name ?? "Product image"}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--text-main)]">
                        {item.name ?? item.product_key}
                      </div>

                      <div className="ui-muted mt-0.5">
                        {item.brand ?? "—"}
                      </div>

                      {item.shade_name ? (
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">
                          Shade:{" "}
                          <span className="font-semibold">{item.shade_name}</span>
                        </div>
                      ) : null}

                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        Qty:{" "}
                        <span className="font-semibold text-[var(--text-secondary)]">
                          {qty}
                        </span>
                      </div>
                    </div>

                    {/* Line total */}
                    <div className="whitespace-nowrap text-sm font-semibold text-[var(--text-main)]">
                      {formatMoney(line)}
                    </div>
                  </div>

                  {/* Unit price */}
                  {unit > 0 ? (
                    <div className="ui-muted mt-1">{formatMoney(unit)} each</div>
                  ) : (
                    <div className="ui-muted mt-1">Price not available</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="ui-divider" />

      {/* Totals */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Subtotal</span>
          <span className="font-semibold text-[var(--text-main)]">
            {formatMoney(subtotal)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Shipping</span>
          <span className="font-semibold text-emerald-600">
            {shippingFee === 0 ? "Free" : formatMoney(shippingFee)}
          </span>
        </div>

        <div
          className="flex items-center justify-between pt-3 text-base"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <span className="font-semibold text-[var(--text-main)]">Total</span>
          <span className="text-lg font-bold text-[var(--text-main)]">
            {formatMoney(total)}
          </span>
        </div>

        {showShippingNote ? (
          <p className="ui-helper pt-1">
            Free shipping on all orders. Taxes calculated at checkout.
          </p>
        ) : null}
      </div>
    </div>
  );
}