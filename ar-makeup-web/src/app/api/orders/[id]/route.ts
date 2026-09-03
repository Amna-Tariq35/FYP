// src/app/api/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ error: message, ...extra }, { status });
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
    .single();

  if (orderErr || !order) {
    return jsonError("Order not found.", 404, {
      details: orderErr?.message ?? null,
    });
  }

  // ✅ order_items RLS should restrict to items of orders owned by user
  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    return jsonError("Failed to load order items.", 500, {
      details: itemsErr.message,
    });
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

  // Load order (RLS enforces ownership)
  const { data: existing, error: loadErr } = await supabase
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .single();

  if (loadErr || !existing) {
    return jsonError("Order not found", 404, loadErr?.message);
  }

  const currentStatus = String(existing.status || "").toLowerCase();

  // Only allow cancel if placed (Phase 2)
  if (currentStatus !== "placed") {
    return jsonError("Only placed orders can be cancelled.", 409, {
      status: existing.status,
    });
  }

  // Update status to cancelled
  const { data: updated, error: updErr } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updErr || !updated) {
    return jsonError("Failed to cancel order.", 500, updErr?.message);
  }

  return NextResponse.json({ order: updated }, { status: 200 });
}
