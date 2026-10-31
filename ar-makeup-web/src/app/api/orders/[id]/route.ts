// src/app/api/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { cancelPlacedOrderForOwner } from "@/src/lib/orders/cancel-placed";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { id: orderId } = await params;

  if (!orderId) {
    return jsonError("Order id is required.", 400);
  }

  // ✅ Auth-only endpoint
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return jsonError("Unauthorized", 401);
  }

  // ✅ orders RLS should restrict to user_id = auth.uid()
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderErr || !order) {
    if (orderErr) console.error("Order lookup failed:", orderErr.message);
    return jsonError("Order not found.", 404);
  }

  // ✅ order_items RLS should restrict to items of orders owned by user
  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    console.error("Order items failed:", itemsErr.message);
    return jsonError("Failed to load order items.", 500);
  }

  return NextResponse.json({ order, items: items ?? [] }, { status: 200 });
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { id: orderId } = await params;

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return jsonError("Unauthorized", 401);
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  // We support one action: cancel
  const action = String(body?.action || "").trim().toLowerCase();
  if (action !== "cancel") return jsonError("Unsupported action.");

  const result = await cancelPlacedOrderForOwner({
    orderId,
    userId: user.id,
    guestToken: null,
  });

  if (result.ok === false) {
    return jsonError(result.error, result.status);
  }

  return NextResponse.json({ order: result.order }, { status: 200 });
}
