"use client";

import React from "react";
import Image from "next/image";

const FALLBACK_IMAGE = "/images/product_placeholder.png";

function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount || 0
  );
}

type ReceiptItem = {
  id: string;
  product_key: string;
  shade_key: string | null;
  shade_name: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type ReceiptOrder = {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  created_at: string;
  guest_token?: string | null;
  guest_email?: string | null;
};

export default function ReceiptSummary({
  order,
  items,
  title = "Receipt",
}: {
  order: ReceiptOrder;
  items: ReceiptItem[];
  title?: string;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
        <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {items?.length || 0} {items?.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="ui-divider" />

      {/* Items */}
      <div className="space-y-4">
        {items.map((it) => {
          const img = it.image_url || FALLBACK_IMAGE;
          return (
            <div key={it.id} className="flex items-start gap-3">
              <div
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--border-soft)", background: "white" }}
              >
                <Image
                  src={img}
                  alt={it.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text-main)]">
                      {it.name}
                    </div>
                    {it.brand ? (
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        {it.brand}
                      </div>
                    ) : null}
                  </div>

                  <div className="whitespace-nowrap text-sm font-semibold text-[var(--text-main)]">
                    {formatMoney(it.line_total, order.currency)}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {it.shade_name ? (
                    <span className="inline-flex items-center rounded-full bg-[#FDF2F4] px-2 py-0.5 text-[10px] font-medium text-[#C06C84]">
                      {it.shade_name}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    Qty: {it.quantity}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    {formatMoney(it.unit_price, order.currency)} each
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ui-divider" />

      {/* Totals */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Subtotal</span>
          <span className="font-semibold text-[var(--text-main)]">
            {formatMoney(order.subtotal, order.currency)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Shipping</span>
          <span className={order.shipping_fee > 0 ? "font-semibold text-[var(--text-main)]" : "font-semibold text-emerald-600"}>
            {order.shipping_fee > 0
              ? formatMoney(order.shipping_fee, order.currency)
              : "Free"}
          </span>
        </div>

        <div
          className="flex items-center justify-between pt-2"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <span className="font-semibold text-[var(--text-main)]">Total</span>
          <span className="text-base font-bold text-[var(--text-main)]">
            {formatMoney(order.total, order.currency)}
          </span>
        </div>
      </div>

      <div className="ui-divider" />

      {/* Shipping address */}
      <div className="rounded-xl bg-black/[0.025] px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Shipping address
        </div>
        <div className="space-y-0.5 text-sm">
          <div className="font-semibold text-[var(--text-main)]">
            {order.shipping_name}
          </div>
          <div className="text-[var(--text-secondary)]">{order.shipping_phone}</div>
          <div className="text-[var(--text-secondary)]">
            {[order.shipping_address, order.shipping_city, order.shipping_country]
              .filter(Boolean)
              .join(", ")}
          </div>
        </div>
      </div>
    </div>
  );
}