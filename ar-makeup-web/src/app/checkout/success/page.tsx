"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CheckoutShell from "@/src/components/checkout/CheckoutShell";
import { clearCart } from "@/src/store/cart";
import { clearShippingInfo } from "@/src/store/checkoutShipping";
import { loadAddToMakeupBag } from "@/src/store/addToMakeupBag";
import Link from "next/link";
import ReceiptSummary from "@/src/components/checkout/ReceiptSummary";
import { supabase } from "@/src/lib/supabase/client";

function shortRef(id?: string | null) {
  if (!id) return "";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();

  const orderId = params.get("order_id");
  const guestToken = params.get("guest_token");
  const sessionId = params.get("session_id"); // Stripe session ID

  const [receipt, setReceipt] = useState<{ order: any; items: any[] } | null>(
    null,
  );
  const [loadingReceipt, setLoadingReceipt] = useState(true);
  const [copied, setCopied] = useState(false);

  // Payment verification state
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "verifying" | "paid" | "failed"
  >("idle");

  const [emailSent, setEmailSent] = useState(false);
  const emailSentRef = React.useRef(false);

  const [bagBanner, setBagBanner] = useState<{
    count: number;
    keys: string[];
  } | null>(null);
  const [bagUndone, setBagUndone] = useState(false);

  // userEmail state ko 3 values do: undefined (loading), null (not logged in), string (email)
const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined); // ← undefined = still loading
useEffect(() => {
  console.log("PAGE LOADED", { orderId, guestToken, sessionId });
}, []);
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setUserEmail(data.user?.email ?? null); // null = confirmed no user
  });
}, []);

  const orderKey = `ar_makeup_checkout_success_cleaned_v1:${orderId || guestToken || "unknown"}`;
  const emailSentKey = `ar_makeup_checkout_success_email_sent_v1:${orderId || guestToken || "unknown"}`;
  const isStripeOrder = Boolean(sessionId);
  const paymentConfirmed = !isStripeOrder || paymentStatus === "paid";
  const hasReceipt = Boolean(receipt?.order);

  // const refLabel = useMemo(() => {
  //   if (orderId) return { label: "Order ID", value: orderId };
  //   if (guestToken) return { label: "Guest Token", value: guestToken };
  //   return { label: "Reference", value: "" };
  // }, [orderId, guestToken]);

  // 1. Verify Stripe Payment (If session_id exists)
  useEffect(() => {
    if (sessionId && orderId) {
      setPaymentStatus("verifying");
      fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, order_id: orderId }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("VERIFY RESPONSE", data);
          if (data.success) {
            setPaymentStatus("paid");
          } else {
            setPaymentStatus("failed");
          }
        })
        .catch(() => setPaymentStatus("failed"));
    }
  }, [sessionId, orderId]);

  // 2. Load Receipt Data
  useEffect(() => {
    async function loadReceipt() {
      setLoadingReceipt(true);
      try {
        if (guestToken) {
          const res = await fetch(
            `/api/orders/guest?guest_token=${encodeURIComponent(guestToken)}`,
          );
          const data = await res.json();
          if (res.ok) setReceipt(data);
          return;
        }
        if (orderId) {
          const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
          const data = await res.json();
          if (res.ok) setReceipt(data);
          return;
        }
      } finally {
        setLoadingReceipt(false);
      }
    }
    loadReceipt();
  }, [orderId, guestToken]);

  // 3. Clear cart as soon as final order is confirmed.
  useEffect(() => {
    if (!hasReceipt || !paymentConfirmed) return;
    if (sessionStorage.getItem(orderKey)) return;

    clearCart();
    clearShippingInfo();
    sessionStorage.setItem(orderKey, "1");
  }, [hasReceipt, paymentConfirmed, orderKey]);

  // 3b. Fill Makeup Bag after a confirmed purchase (COD + Stripe).
  useEffect(() => {
    if (!hasReceipt || !paymentConfirmed || !orderId || guestToken) return;

    const undoneKey = `ar_makeup_bag_undone:${orderId}`;
    const filledKey = `ar_makeup_bag_filled:${orderId}`;
    if (sessionStorage.getItem(undoneKey)) {
      setBagUndone(true);
      return;
    }
    if (sessionStorage.getItem(filledKey)) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(filledKey) || "null");
        if (cached?.count) setBagBanner(cached);
      } catch {}
      return;
    }
    if (!loadAddToMakeupBag()) return;

    fetch("/api/makeup-bag/from-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, add_to_bag: true }),
    })
      .then((res) => res.json())
      .then((data) => {
        const count = Number(data?.added || data?.keys?.length || 0);
        const keys: string[] = Array.isArray(data?.keys) ? data.keys : [];
        if (count > 0 || keys.length > 0) {
          const payload = { count: count || keys.length, keys };
          sessionStorage.setItem(filledKey, JSON.stringify(payload));
          setBagBanner(payload);
        }
      })
      .catch((err) => console.error("Makeup bag fill failed:", err));
  }, [hasReceipt, paymentConfirmed, orderId, guestToken]);

  // 4. Send order confirmation email after receipt + payment confirmation.
  useEffect(() => {
    console.log("[EMAIL EFFECT RUNNING]", {
      paymentStatus,
      hasReceipt,
      userEmail,
      sessionId,
    });

    if (emailSentRef.current) return;
    if (!hasReceipt || !paymentConfirmed) return;
    if (userEmail === undefined) return;
    if (sessionStorage.getItem(emailSentKey)) return;

    const isCOD = !sessionId;
    const emailTo = receipt?.order?.guest_email || userEmail;
    if (!emailTo) return;

    emailSentRef.current = true;

    fetch("/api/send-order-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: emailTo,
        userName: receipt?.order?.shipping_name || "Valued Customer",
        orderDetails: {
          order_id: orderId || guestToken,
          payment_method: isCOD ? "cash_on_delivery" : "online",
          items: receipt?.items,
          total: receipt?.order?.total,
        },
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          sessionStorage.setItem(emailSentKey, "1");
          setEmailSent(true);
          setTimeout(() => setEmailSent(false), 3000);
        } else {
          console.error("[send-order-email] API responded with failure", data);
          emailSentRef.current = false;
        }
      })
      .catch((err) => {
        console.error("Email send failed:", err);
        emailSentRef.current = false;
      });
  }, [hasReceipt, paymentConfirmed, receipt, userEmail, orderId, guestToken, paymentStatus, sessionId, emailSentKey]);

  // async function copyRef() {
  //   if (!refLabel.value) return;
  //   try {
  //     await navigator.clipboard.writeText(refLabel.value);
  //     setCopied(true);
  //     setTimeout(() => setCopied(false), 1200);
  //   } catch {}
  // }

  return (
    <>
      <CheckoutShell
        step="success"
        title="Checkout"
        subtitle="Your order has been placed successfully."
        left={
          <div className="space-y-5">
            <div className="ui-section p-5">
              <h2 className="ui-h2">
                {paymentStatus === "verifying"
                  ? "Verifying Payment ⏳"
                  : paymentStatus === "failed"
                    ? "Payment Failed ❌"
                    : "Order placed 🎉"}
              </h2>

              <p className="ui-muted mt-1">
                {paymentStatus === "verifying"
                  ? "Please wait while we confirm your payment with Stripe..."
                  : paymentStatus === "failed"
                    ? "There was an issue verifying your payment. Your order is saved as 'Failed'."
                    : "We’ve saved your order. You can continue shopping anytime."}
              </p>

              <div className="ui-divider" />

              {/* <div className="space-y-2">
                <div className="text-sm font-semibold text-[var(--text-main)]">
                  {refLabel.label}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="ui-chip">{shortRef(refLabel.value)}</span>

                  <button
                    type="button"
                    className="ui-btn-ghost"
                    onClick={copyRef}
                  >
                    {copied ? "Copied ✅" : "Copy"}
                  </button>
                </div>

                {guestToken ? (
                  <p className="ui-helper mt-2">
                    Save this token to track your guest order later.
                  </p>
                ) : null}
              </div> */}

              <div className="ui-divider" />

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="ui-btn"
                  onClick={() => router.push("/products")}
                >
                  Continue shopping
                </button>

                {guestToken ? (
                  <button
                    type="button"
                    className="ui-btn-secondary"
                    onClick={() =>
                      router.push(
                        `/order/track?guest_token=${encodeURIComponent(guestToken)}`,
                      )
                    }
                  >
                    Track order (guest)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ui-btn-secondary"
                    onClick={() => router.push("/my-orders")}
                  >
                    View My Orders
                  </button>
                )}
              </div>
            </div>

            {bagBanner && !bagUndone ? (
              <div className="ui-section flex flex-wrap items-center justify-between gap-3 p-5">
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  {bagBanner.count} item{bagBanner.count === 1 ? "" : "s"} added
                  to your Makeup Bag ✓
                </p>
                <div className="flex gap-2">
                  <Link href="/makeup-bag" className="ui-btn-ghost text-xs">
                    View bag
                  </Link>
                  <button
                    type="button"
                    className="ui-btn-secondary text-xs"
                    onClick={async () => {
                      if (!orderId) return;
                      await fetch("/api/makeup-bag/from-order", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ keys: bagBanner.keys }),
                      });
                      sessionStorage.setItem(
                        `ar_makeup_bag_undone:${orderId}`,
                        "1",
                      );
                      sessionStorage.removeItem(
                        `ar_makeup_bag_filled:${orderId}`,
                      );
                      setBagUndone(true);
                      setBagBanner(null);
                    }}
                  >
                    Undo
                  </button>
                </div>
              </div>
            ) : null}

            <div className="ui-section p-5">
              <div className="text-sm font-semibold text-[var(--text-main)]">
                Order Status
              </div>
              <ul className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
                {sessionId ? (
                  <li>
                    • Payment Status:{" "}
                    <span className="font-semibold capitalize">
                      {paymentStatus === "idle" ? "Paid" : paymentStatus}
                    </span>
                  </li>
                ) : (
                  <li>
                    • Payment Status:{" "}
                    <span className="font-semibold">
                      Cash on Delivery (Placed)
                    </span>
                  </li>
                )}
                <li>
                 
                </li>
              </ul>
            </div>
          </div>
        }
        right={
          <div>
            {loadingReceipt ? (
              <div className="ui-muted">Loading receipt…</div>
            ) : receipt?.order ? (
              <ReceiptSummary
                order={receipt.order}
                items={receipt.items || []}
              />
            ) : (
              <div className="ui-muted">Receipt not available.</div>
            )}
          </div>
        }
      />

      {emailSent && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#22c55e",
            color: "white",
            padding: "12px 24px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            zIndex: 9999,
            animation: "fadeIn 0.3s ease",
          }}
        >
          ✅ Order confirmation sent to your email!
        </div>
      )}
    </>
  );
}
