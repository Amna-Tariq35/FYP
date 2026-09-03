// src/app/api/orders/guest/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function safeString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

// ✅ Guest header client (anon) — sends x-guest-token for RLS
function createGuestHeaderClient(guestToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, anonKey, {
    global: {
      headers: {
        "x-guest-token": guestToken,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const guest_token = safeString(searchParams.get("guest_token"));

  if (!guest_token) {
    return jsonError("guest_token is required.", 400);
  }

  // IMPORTANT: Use anon + x-guest-token so RLS can validate guest
  const supabase = createGuestHeaderClient(guest_token);

  // 1) fetch order (RLS must allow select only when x-guest-token matches)
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("guest_token", guest_token)
    .single();

  if (orderErr || !order) {
    return jsonError("Order not found.", 404, {
      details: orderErr?.message ?? null,
    });
  }

  // 2) fetch items (RLS must allow select based on same token)
  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    return jsonError("Failed to load order items.", 500, {
      details: itemsErr.message,
    });
  }

  return NextResponse.json({ order, items: items ?? [] }, { status: 200 });
}
