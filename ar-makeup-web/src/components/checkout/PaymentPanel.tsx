"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadShippingInfo } from "@/src/store/checkoutShipping";
import { loadAddToMakeupBag } from "@/src/store/addToMakeupBag";
import type { ShippingInfo } from "@/src//types/order";
import { loadCart, type CartState } from "@/src//store/cart";

function isShippingComplete(s: ShippingInfo) {
  return (
    !!s.name?.trim() &&
    !!s.phone?.trim() &&
    !!s.address?.trim() &&
    !!s.city?.trim() &&
    !!s.country?.trim()
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function PaymentPanel() {
  const router = useRouter();
  const [shipping, setShipping] = useState<ShippingInfo>(() =>
    loadShippingInfo(),
  );

  const [selectedMethod, setSelectedMethod] = useState<"cod" | "card">("cod");
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadShippingInfo();
    setShipping(s);

    if (!isShippingComplete(s)) {
      router.replace("/checkout/shipping");
    }
  }, [router]);

  const shippingLine = useMemo(() => {
    const parts = [shipping.address, shipping.city, shipping.country].filter(Boolean);
    return parts.join(", ");
  }, [shipping.address, shipping.city, shipping.country]);

  async function placeOrder() {
    setError(null);
    setIsPlacing(true);

    try {
      const currentCart: CartState = loadCart();
      const items = currentCart.items || [];
      const currentShipping = loadShippingInfo();

      if (!items.length) {
        setError("Your cart is empty. Please add items before checkout.");
        router.replace("/cart");
        return;
      }

      if (!isShippingComplete(currentShipping)) {
        setError("Shipping details are incomplete. Please fill shipping first.");
        router.replace("/checkout/shipping");
        return;
      }

      if (currentShipping.email?.trim()) {
        if (!isValidEmail(currentShipping.email)) {
          setError("Please enter a valid email address (or clear it).");
          setIsPlacing(false);
          return;
        }
      }

      const payload = {
        shipping: currentShipping,
        items: items.map((it) => ({
          product_key: it.product_key,
          shade_key: it.shade_key ?? null,
          quantity: it.quantity,
          name: it.name,
          brand: it.brand,
          shade_name: it.shade_name,
          price: it.price,
          image_url: it.image_url,
        })),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.error ||
          data?.details ||
          "Something went wrong while creating your order. Please try again.";
        setError(msg);
        setIsPlacing(false);
        return;
      }

      const orderId: string | undefined = data?.order_id;
      const guestToken: string | undefined = data?.guest_token;

      if (!orderId && !guestToken) {
        setError("Order created, but no reference returned. Please try again.");
        setIsPlacing(false);
        return;
      }

      if (selectedMethod === "card") {
        if (!orderId) {
          setError("Unable to determine order ID for Stripe checkout.");
          setIsPlacing(false);
          return;
        }

        const stripeResp = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            orderId,
            addToMakeupBag: loadAddToMakeupBag(),
          }),
        });

        const stripeData = await stripeResp.json().catch(() => ({}));

        if (!stripeResp.ok) {
          const msg =
            stripeData?.error ||
            "Failed to create Stripe checkout session. Please try again.";
          setError(msg);
          setIsPlacing(false);
          return;
        }

        if (stripeData.url) {
          window.location.href = stripeData.url;
        } else {
          setError("Stripe session URL not found. Please try again.");
          setIsPlacing(false);
        }

        return;
      }

      // COD flow — clear cart + shipping, navigate to success
      try {
        localStorage.removeItem("ar_makeup_cart_v1");
        localStorage.removeItem("ar_shipping_v1");
      } catch {}

      if (guestToken) {
        router.replace(
          `/checkout/success?guest_token=${encodeURIComponent(guestToken)}`,
        );
        return;
      }

      router.replace(
        `/checkout/success?order_id=${encodeURIComponent(orderId!)}`,
      );
    } catch (e: any) {
      setError(e?.message || "Network error. Please try again.");
    } finally {
      setIsPlacing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="ui-h2">Payment</h2>
        <p className="ui-muted mt-1">
          Choose your preferred payment method to complete the order.
        </p>
      </div>

      {/* Error */}
      {error ? (
        <div
          className="rounded-2xl border p-4"
          style={{
            borderColor: "color-mix(in srgb, #FDA29B 55%, var(--border-soft))",
            background: "color-mix(in srgb, #FDA29B 10%, white)",
          }}
          role="alert"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  stroke="#dc2626"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">
                Couldn't place order
              </div>
              <div className="ui-muted mt-0.5">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Shipping preview */}
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "var(--border-soft)", background: "white" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-[#C06C84]">
              <path
                d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Delivering to
          </div>
          <button
            type="button"
            className="ui-btn-ghost text-xs"
            onClick={() => router.push("/checkout/shipping")}
            disabled={isPlacing}
          >
            Edit
          </button>
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <div className="font-semibold text-[var(--text-main)]">
            {shipping.name || "—"}
          </div>
          <div className="text-[var(--text-secondary)]">{shipping.phone || "—"}</div>
          <div className="text-[var(--text-secondary)]">{shippingLine || "—"}</div>

          {shipping.email?.trim() ? (
            <div className="text-[var(--text-muted)]">{shipping.email}</div>
          ) : (
            <div className="text-[var(--text-muted)] text-xs mt-1">
              No email provided —{" "}
              <button
                type="button"
                className="text-[#C06C84] hover:underline"
                onClick={() => router.push("/checkout/shipping")}
                disabled={isPlacing}
              >
                add one for order tracking
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment method */}
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "var(--border-soft)", background: "white" }}
      >
        <div className="text-sm font-semibold text-[var(--text-main)]">
          Payment method
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card option */}
          <button
            type="button"
            onClick={() => setSelectedMethod("card")}
            disabled={isPlacing}
            className={[
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all text-left",
              selectedMethod === "card"
                ? "border-[#C06C84] bg-[#FDF2F4] text-[#C06C84]"
                : "border-[var(--border-soft)] bg-white text-[var(--text-secondary)] hover:border-[#C06C84]/40",
            ].join(" ")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <div>
              <div className="font-semibold text-sm">Card</div>
              <div className="text-[10px] opacity-70">Powered by Stripe</div>
            </div>
          </button>

          {/* COD option */}
          <button
            type="button"
            onClick={() => setSelectedMethod("cod")}
            disabled={isPlacing}
            className={[
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all text-left",
              selectedMethod === "cod"
                ? "border-[#C06C84] bg-[#FDF2F4] text-[#C06C84]"
                : "border-[var(--border-soft)] bg-white text-[var(--text-secondary)] hover:border-[#C06C84]/40",
            ].join(" ")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 6v2m0 8v2M9 8.27l1 1.73M14 14l1 1.73M6.27 9l1.73 1M16 14l1.73 1M6 12h2m8 0h2M6.27 15l1.73-1M16 10l1.73-1M9 15.73l1-1.73M14 10l1-1.73"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <div className="font-semibold text-sm">Cash on Delivery</div>
              <div className="text-[10px] opacity-70">Pay when it arrives</div>
            </div>
          </button>
        </div>
      </div>

      <div className="ui-divider" />

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="ui-btn-secondary"
          onClick={() => router.push("/checkout/shipping")}
          disabled={isPlacing}
        >
          Back
        </button>

        <button
          type="button"
          className="ui-btn"
          onClick={placeOrder}
          disabled={isPlacing}
        >
          {isPlacing ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Processing…
            </span>
          ) : (
            "Place order"
          )}
        </button>
      </div>

      <p className="ui-muted text-xs">
        After placing the order, you'll receive a confirmation and your cart
        will be cleared automatically.
      </p>
    </div>
  );
}