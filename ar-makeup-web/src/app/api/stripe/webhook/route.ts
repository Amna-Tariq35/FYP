import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { addOrderItemsToDefaultBag } from "@/src/lib/makeup-bag/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

async function releaseOrderStock(orderId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "placed") return;

  const { data: items, error } = await supabase
    .from("order_items")
    .select("product_key,quantity")
    .eq("order_id", orderId);
  if (error) throw error;

  for (const item of items ?? []) {
    const { error: releaseError } = await supabase.rpc("release_product_stock", {
      p_product_key: item.product_key,
      p_quantity: item.quantity,
    });
    if (releaseError) throw releaseError;
  }

  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "placed");
}

export async function POST(request: Request) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid webhook signature";
    console.error("Stripe webhook signature verification failed:", message);
    return new Response(`Webhook error: ${message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId as string | undefined;
      const addToBag = session.metadata?.add_to_makeup_bag !== "false";

      if (orderId) {
        try {
          const supabase = createSupabaseAdminClient();
          await supabase
            .from("orders")
            .update({ status: "paid" })
            .eq("id", orderId)
            .eq("status", "placed");
          console.log(`Order ${orderId} marked paid via webhook`);

          if (addToBag) {
            const bagResult = await addOrderItemsToDefaultBag(supabase, orderId, {
              addToBag: true,
            });
            console.log(`Makeup bag fill for ${orderId}:`, bagResult);
          }
        } catch (e) {
          console.error("Failed to update order / makeup bag in webhook:", e);
        }
      } else {
        console.warn("checkout.session.completed event missing orderId metadata");
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        try {
          await releaseOrderStock(orderId);
        } catch (error) {
          console.error("Failed to release expired checkout stock:", error);
        }
      }
      break;
    }
    default:
      break;
  }

  return new Response("ok");
}
