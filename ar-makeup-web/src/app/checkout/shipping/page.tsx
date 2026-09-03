// src/app/checkout/shipping/page.tsx
"use client";

import BuyLookBanner from "@/src/components/checkout/BuyLookBanner";
import CheckoutGuard from "@/src/components/checkout/CheckoutGuard";
import CheckoutShell from "@/src/components/checkout/CheckoutShell";
import OrderSummary from "@/src/components/checkout/OrderSummary";
import ShippingForm from "@/src/components/checkout/ShippingForm";

export default function CheckoutShippingPage() {
  return (
    <CheckoutGuard redirectTo="/cart" loadingText="Redirecting…">
      <CheckoutShell
        step="shipping"
        title="Checkout"
        subtitle="Enter your shipping details to continue."
        left={
          <>
            {/* Renders nothing unless the user arrived from "Buy this look". */}
            <BuyLookBanner />
            <ShippingForm />
          </>
        }
        right={<OrderSummary />}
      />
    </CheckoutGuard>
  );
}
