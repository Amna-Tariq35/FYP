// src/app/checkout/payment/page.tsx
"use client";

import CheckoutGuard from "@/src/components/checkout/CheckoutGuard";
import CheckoutShell from "@/src/components/checkout/CheckoutShell";
import OrderSummary from "@/src/components/checkout/OrderSummary";
import PaymentPanel from "@/src/components/checkout/PaymentPanel";

export default function CheckoutPaymentPage() {
  return (
    <CheckoutGuard loadingText="Checking your cart…">
      <CheckoutShell
        step="payment"
        title="Checkout"
        subtitle="Review your details and place your order."
        left={<PaymentPanel />}
        right={<OrderSummary />}
      />
    </CheckoutGuard>
  );
}
