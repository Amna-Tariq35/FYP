import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { addOrderItemsToDefaultBag } from "@/src/lib/makeup-bag/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

export async function POST(request: Request) {
  try {
    const { session_id, order_id } = await request.json();

    if (!session_id || !order_id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.metadata?.orderId && session.metadata.orderId !== order_id) {
      return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
    }

    if (session.payment_status === "paid") {
      const supabaseAdmin = createSupabaseAdminClient();
      const { error } = await supabaseAdmin
        .from("orders")
        .update({ status: "paid" })
        .eq("id", order_id);

      if (error) throw error;

      const addToBag = session.metadata?.add_to_makeup_bag !== "false";
      if (addToBag) {
        await addOrderItemsToDefaultBag(supabaseAdmin, order_id, { addToBag: true });
      }

      return NextResponse.json({ success: true, status: "paid" });
    }

    return NextResponse.json({
      success: false,
      status: session.payment_status,
    });
  } catch (error: any) {
    console.error("Verify Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}