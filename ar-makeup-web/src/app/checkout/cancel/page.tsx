"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function CheckoutCancelPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("order_id");

  const [statusMsg, setStatusMsg] = useState("Cancelling your order...");

  useEffect(() => {
    if (orderId) {
      // API call to update order status to 'cancelled'
      fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setStatusMsg("Payment was cancelled. Your order has been marked as Cancelled.");
          } else {
            setStatusMsg("Payment was cancelled, but we couldn't update the order status.");
          }
        })
        .catch(() => setStatusMsg("Error updating order status."));
    } else {
      setStatusMsg("Payment was cancelled.");
    }
  }, [orderId]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base, #FAF7F5)" }}>
      <div className="p-8 bg-white rounded-2xl shadow-sm text-center max-w-md w-full">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold mb-4 text-[var(--text-main, #1F1F1F)]">
          Payment Cancelled
        </h1>
        
        <p className="text-[var(--text-secondary, #8A8A8A)] mb-6">
          {statusMsg}
        </p>

        <p className="text-sm text-[var(--text-muted, #8A8A8A)] mb-6">
          Your items are still in your cart. You can try checking out again when you're ready.
        </p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => router.push("/cart")}
            className="w-full py-3 rounded-xl text-white font-medium transition-all"
            style={{ background: "var(--rose-primary, #C06C84)" }}
          >
            Return to Cart
          </button>
          
          <button 
            onClick={() => router.push("/my-orders")}
            className="w-full py-3 rounded-xl font-medium transition-all ui-btn-ghost"
          >
            View My Orders
          </button>
        </div>
      </div>
    </div>
  );
}