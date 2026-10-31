"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { loadCart, selectedCartItems } from "@/src/store/cart";

type Props = {
  /** What to show while we are checking cart */
  loadingText?: string;
  /** Checkout content that should render ONLY when cart has items */
  children: React.ReactNode;
};

type CartGate = "pending" | "yes" | "no";

function subscribeToCart(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function readCartGate(): CartGate {
  return selectedCartItems(loadCart()).length > 0 ? "yes" : "no";
}

function pendingCartGate(): CartGate {
  return "pending";
}

export default function CheckoutGuard({
  loadingText = "Checking your cart…",
  children,
}: Props) {
  const gate = useSyncExternalStore(subscribeToCart, readCartGate, pendingCartGate);

  if (gate === "pending") {
    return (
      <div className="min-h-[calc(100vh-72px)]" style={{ background: "var(--bg-base)" }}>
        <div className="mx-auto max-w-6xl px-4 py-16 flex flex-col items-center justify-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#C06C84]/25 border-t-[#C06C84]" />
          <div className="text-sm font-semibold text-[var(--text-main)]">{loadingText}</div>
        </div>
      </div>
    );
  }

  if (gate === "no") {
    return (
      <div className="min-h-[calc(100vh-72px)]" style={{ background: "var(--bg-base)" }}>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">Your cart is empty</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Add a product before you continue to checkout.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-block rounded-xl bg-[var(--rose-primary)] px-4 py-2 text-white"
          >
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
