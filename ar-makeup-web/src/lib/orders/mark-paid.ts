import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { addOrderItemsToDefaultBag } from "@/src/lib/makeup-bag/server";
import { loadCheckoutOrder } from "@/src/lib/orders/checkout-session";

const PAID_STATUSES = new Set(["paid", "processing", "shipped", "delivered"]);

export async function markOrderPaidFromCheckoutSession(
  session: Stripe.Checkout.Session,
  expectedOrderId: string,
) {
  const metadataOrderId = session.metadata?.orderId;
  if (!metadataOrderId || metadataOrderId !== expectedOrderId) {
    return { ok: false as const, status: 400, error: "Order mismatch" };
  }
  if (session.payment_status !== "paid") {
    return {
      ok: false as const,
      status: 409,
      error: "Payment is not complete.",
      payment_status: session.payment_status,
    };
  }

  const admin = createSupabaseAdminClient();
  const loaded = await loadCheckoutOrder(admin, expectedOrderId);
  if (loaded.error) return { ok: false as const, status: 500, error: "Could not load order." };
  if (!loaded.order) return { ok: false as const, status: 404, error: "Order not found." };

  const order = loaded.order;
  if (
    order.stripe_checkout_session_id &&
    order.stripe_checkout_session_id !== session.id
  ) {
    return { ok: false as const, status: 400, error: "Order mismatch" };
  }

  if (PAID_STATUSES.has(order.status)) {
    return { ok: true as const, already: true, status: order.status };
  }
  if (order.status !== "placed") {
    return { ok: false as const, status: 409, error: "Only a placed order can be marked paid." };
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update({ status: "paid" })
    .eq("id", expectedOrderId)
    .eq("status", "placed")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("mark paid:", error);
    return { ok: false as const, status: 500, error: "Could not update the order." };
  }

  if (!updated) {
    const again = await loadCheckoutOrder(admin, expectedOrderId);
    if (again.order && PAID_STATUSES.has(again.order.status)) {
      return { ok: true as const, already: true, status: again.order.status };
    }
    return { ok: false as const, status: 409, error: "Only a placed order can be marked paid." };
  }

  if (session.metadata?.add_to_makeup_bag !== "false") {
    await addOrderItemsToDefaultBag(admin, expectedOrderId, { addToBag: true });
  }

  return { ok: true as const, already: false, status: "paid" };
}
