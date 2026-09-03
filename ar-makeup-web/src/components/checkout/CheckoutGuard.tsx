"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadCart, getCartCount } from "@/src/store/cart";

type Props = {
  /** Where to send user if cart is empty */
  redirectTo?: string;
  /** What to show while we are checking cart */
  loadingText?: string;
  /** Checkout content that should render ONLY when cart has items */
  children: React.ReactNode;
};

export default function CheckoutGuard({
  redirectTo = "/cart",
  loadingText = "Checking your cart…",
  children,
}: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const state = loadCart();
    const count = getCartCount(state);

    if (count <= 0) {
      setAllowed(false);
      router.replace(redirectTo);
      return;
    }

    setAllowed(true);
  }, [router, redirectTo]);

  if (allowed !== true) {
    return (
      <div className="min-h-[calc(100vh-72px)]" style={{ background: "var(--bg-base)" }}>
        <div className="mx-auto max-w-6xl px-4 py-16 flex flex-col items-center justify-center gap-4">
          {/* Spinner */}
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#C06C84]/25 border-t-[#C06C84]" />

          <div className="text-center">
            <div className="text-sm font-semibold text-[var(--text-main)]">
              {loadingText}
            </div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">
              Your cart is empty. Taking you back to cart.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}