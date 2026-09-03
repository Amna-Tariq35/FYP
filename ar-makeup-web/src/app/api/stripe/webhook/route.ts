import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { addOrderItemsToDefaultBag } from "@/src/lib/makeup-bag/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

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
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
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
            .eq("id", orderId);
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
    default:
      break;
  }

  return new Response("ok");
}
