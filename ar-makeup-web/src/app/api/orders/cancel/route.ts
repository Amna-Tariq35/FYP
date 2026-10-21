import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { cancelPlacedOrderForOwner } from "@/src/lib/orders/cancel-placed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const guestToken = typeof body?.guest_token === "string" ? body.guest_token.trim() : "";

    if (!orderId) {
      return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const result = await cancelPlacedOrderForOwner({
      orderId,
      userId: user?.id ?? null,
      guestToken: guestToken || null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, order: result.order });
  } catch (error: unknown) {
    console.error("Cancel Order Error:", error);
    return NextResponse.json({ error: "Could not cancel the order." }, { status: 500 });
  }
}
