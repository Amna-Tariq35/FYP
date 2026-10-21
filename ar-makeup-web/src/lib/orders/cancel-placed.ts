import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

type CancelFailure = { ok: false; status: number; error: string };
type CancelSuccess = { ok: true; order: Record<string, unknown> };

function ownsOrder(
  order: { user_id: string | null; guest_token: string | null },
  userId: string | null,
  guestToken: string | null,
) {
  if (order.user_id) return Boolean(userId) && order.user_id === userId;
  return Boolean(guestToken) && order.guest_token === guestToken;
}

/**
 * Flip a placed order to cancelled, then release reserved stock for its lines.
 * Paid and later statuses are left unchanged. No refund is created.
 */
export async function releaseAndCancelPlacedOrder(orderId: string): Promise<CancelFailure | { ok: true }> {
  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return { ok: false, status: 404, error: "Order not found." };
  if (order.status !== "placed") {
    return { ok: false, status: 409, error: "Only placed orders can be cancelled." };
  }

  const { data: claimed, error: claimError } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "placed")
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return { ok: false, status: 409, error: "Only placed orders can be cancelled." };
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_key,quantity")
    .eq("order_id", orderId);

  if (itemsError) {
    console.error("cancel placed order items:", itemsError);
    return { ok: false, status: 500, error: "Order was cancelled but stock could not be loaded." };
  }

  for (const item of items ?? []) {
    const quantity = Number(item.quantity);
    if (!item.product_key || !Number.isFinite(quantity) || quantity <= 0) continue;
    const { error: releaseError } = await admin.rpc("release_product_stock", {
      p_product_key: item.product_key,
      p_quantity: quantity,
    });
    if (releaseError) {
      console.error("release_product_stock:", releaseError);
      return { ok: false, status: 500, error: "Order was cancelled but stock could not be fully released." };
    }
  }

  return { ok: true };
}

export async function cancelPlacedOrderForOwner(input: {
  orderId: string;
  userId: string | null;
  guestToken: string | null;
}): Promise<CancelFailure | CancelSuccess> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, status: 400, error: "Order id is required." };
  if (!input.userId && !input.guestToken) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const admin = createSupabaseAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id,user_id,guest_token,status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return { ok: false, status: 404, error: "Order not found." };
  if (!ownsOrder(order, input.userId, input.guestToken)) {
    return { ok: false, status: 403, error: "You cannot cancel this order." };
  }
  if (order.status !== "placed") {
    return { ok: false, status: 409, error: "Only placed orders can be cancelled." };
  }

  const cancelled = await releaseAndCancelPlacedOrder(orderId);
  if (!cancelled.ok) return cancelled;

  const { data: updated, error: loadError } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (loadError || !updated) {
    return { ok: false, status: 500, error: "Order was cancelled but could not be reloaded." };
  }

  return { ok: true, order: updated };
}
