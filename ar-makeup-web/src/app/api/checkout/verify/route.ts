import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { loadCheckoutOrder } from "@/src/lib/orders/checkout-session";
import { markOrderPaidFromCheckoutSession } from "@/src/lib/orders/mark-paid";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    const orderId = typeof body?.order_id === "string" ? body.order_id : "";

    if (!sessionId || !orderId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const loaded = await loadCheckoutOrder(admin, orderId);
    if (loaded.error) {
      return NextResponse.json({ error: "Could not load the order." }, { status: 500 });
    }
    if (!loaded.order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (loaded.order.status !== "placed" && loaded.order.status !== "paid") {
      return NextResponse.json({ error: "Only a placed order can be verified." }, { status: 409 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await markOrderPaidFromCheckoutSession(session, orderId);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, status: result.payment_status ?? loaded.order.status },
        { status: result.status },
      );
    }

    return NextResponse.json({ success: true, status: "paid", already: result.already });
  } catch (error: unknown) {
    console.error("Verify Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify payment." },
      { status: 500 },
    );
  }
}
