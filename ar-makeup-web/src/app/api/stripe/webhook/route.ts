import Stripe from "stripe";
import { releaseAndCancelPlacedOrder } from "@/src/lib/orders/cancel-placed";
import { markOrderPaidFromCheckoutSession } from "@/src/lib/orders/mark-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid webhook signature";
    console.error("Stripe webhook signature verification failed:", message);
    return new Response(`Webhook error: ${message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) {
        console.warn("checkout.session.completed event missing orderId metadata");
        break;
      }
      try {
        const result = await markOrderPaidFromCheckoutSession(session, orderId);
        if (!result.ok) {
          console.error(`Order ${orderId} was not marked paid:`, result.error);
        } else if (result.already) {
          console.log(`Order ${orderId} already paid; skipped a second apply`);
        } else {
          console.log(`Order ${orderId} marked paid via webhook`);
        }
      } catch (e) {
        console.error("Failed to update order / makeup bag in webhook:", e);
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        try {
          await releaseAndCancelPlacedOrder(orderId);
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
