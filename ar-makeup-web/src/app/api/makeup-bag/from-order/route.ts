import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import {
  addOrderItemsToDefaultBag,
  removePurchaseItemsFromBag,
} from "@/src/lib/makeup-bag/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return jsonError("Unauthorized", 401);

  let body: { order_id?: string; add_to_bag?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const orderId = String(body.order_id || "").trim();
  if (!orderId) return jsonError("order_id is required.");

  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.user_id !== user.id) {
    return jsonError("Order not found.", 404);
  }

  const result = await addOrderItemsToDefaultBag(supabase, orderId, {
    addToBag: body.add_to_bag !== false,
  });

  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return jsonError("Unauthorized", 401);

  let body: { keys?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body.");
  }

  const keys = Array.isArray(body.keys) ? body.keys.filter(Boolean) : [];
  const removed = await removePurchaseItemsFromBag(supabase, user.id, keys);
  return NextResponse.json({ removed });
}
