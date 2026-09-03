// src/app/api/orders/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { CreateOrderPayload } from "@/src/types/order";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function safeString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

type NormalizedItem = {
  product_key: string;
  shade_key: string | null;
  quantity: number;
  name: string;
  brand: string | null;
  shade_name: string | null;
  image_url: string | null;
  unit_price: number;
};

// ✅ anon client with guest header (for RLS checks using request.headers)
function createGuestHeaderClient(guestToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    global: { headers: { "x-guest-token": guestToken } },
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  let body: CreateOrderPayload | null = null;
  try {
    body = (await req.json()) as CreateOrderPayload;
  } catch {
    return jsonError("Invalid JSON body.");
  }

  if (!body?.shipping) return jsonError("Missing shipping info.");
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return jsonError("Cart is empty.");
  }

  // -----------------------------
  // Validate + normalize shipping
  // -----------------------------
  const shipping = body.shipping;
  const email = safeString(shipping.email);
  const shipping_name = safeString(shipping.name);
  const shipping_phone = safeString(shipping.phone);
  const shipping_address = safeString(shipping.address);
  const shipping_city = safeString(shipping.city);
  const shipping_country = safeString(shipping.country);

  if (!shipping_name) return jsonError("Shipping name is required.");
  if (!shipping_phone) return jsonError("Shipping phone is required.");
  if (!shipping_address) return jsonError("Shipping address is required.");
  if (!shipping_city) return jsonError("Shipping city is required.");
  if (!shipping_country) return jsonError("Shipping country is required.");

  if (email && !isValidEmail(email)) return jsonError("Invalid email.");

  // -----------------------------
  // Validate + normalize items
  // -----------------------------
  const normalizedItems: NormalizedItem[] = body.items
    .map((it) => {
      const product_key = safeString(it.product_key);
      const shade_key = it.shade_key ? safeString(it.shade_key) : null;

      const quantity = Math.floor(safeNumber(it.quantity));
      const unit_price = safeNumber(it.price);

      const name = safeString(it.name) || product_key;
      const brand = it.brand ? safeString(it.brand) : null;
      const shade_name = it.shade_name ? safeString(it.shade_name) : null;
      const image_url = it.image_url ? safeString(it.image_url) : null;

      return {
        product_key,
        shade_key,
        quantity,
        name,
        brand,
        shade_name,
        image_url,
        unit_price,
      };
    })
    .filter((it) => it.product_key && it.quantity > 0);

  if (normalizedItems.length === 0) return jsonError("No valid cart items.");

  // -----------------------------
  // Totals
  // -----------------------------
  const currency = "USD";
  const shipping_fee = 0;
  const subtotal = normalizedItems.reduce(
    (acc, it) => acc + it.unit_price * it.quantity,
    0
  );
  const total = subtotal + shipping_fee;

  // -----------------------------
  // Identify session
  // -----------------------------
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  const user_id = userErr ? null : user?.id ?? null;

  // guest_email: optional but we require it for guest checkout in Phase 2
  const guest_email = user_id ? null : (email || null);
  const user_email = user_id ? (user?.email ?? null) : null;
  if (!user_id && !guest_email) {
    return jsonError("Email is required for guest checkout.");
  }

  // -----------------------------
  // Insert order header
  // -----------------------------
  let order_id: string | null = null;
  let guest_token: string | null = null;

  if (user_id) {
    // AUTH: select id (your auth select policy should allow own)
    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id,
        guest_email: null,
        guest_token: null,
        status: "placed",
        currency,
        subtotal,
        shipping_fee,
        total,
        shipping_name,
        shipping_phone,
        shipping_address,
        shipping_city,
        shipping_country,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("ORDER INSERT ERROR (auth):", error);
      return NextResponse.json(
        { error: "Failed to create order.", details: error?.message ?? null },
        { status: 500 }
      );
    }

    order_id = data.id;
  } else {
    // GUEST: create token, insert header without select
    guest_token = randomUUID();

    const { error: insertErr } = await supabase.from("orders").insert({
      user_id: null,
      guest_email,
      guest_token,
      status: "placed",
      currency,
      subtotal,
      shipping_fee,
      total,
      shipping_name,
      shipping_phone,
      shipping_address,
      shipping_city,
      shipping_country,
    });

    if (insertErr) {
      console.error("ORDER INSERT ERROR (guest):", insertErr);
      return NextResponse.json(
        { error: "Failed to create order.", details: insertErr.message },
        { status: 500 }
      );
    }

    // Resolve order_id via RPC
    const { data: orderIdData, error: rpcErr } = await supabase.rpc(
      "get_order_id_by_guest_token",
      { p_token: guest_token } // uuid
    );

    if (rpcErr || !orderIdData) {
      console.error("GUEST TOKEN LOOKUP ERROR:", rpcErr);
      return NextResponse.json(
        {
          error: "Order created but failed to finalize items.",
          details: rpcErr?.message ?? null,
          guest_token,
        },
        { status: 500 }
      );
    }

    order_id = orderIdData as string;
  }

  // -----------------------------
  // Insert order items
  // -----------------------------
  const itemsToInsert = normalizedItems.map((it) => ({
    order_id,
    product_key: it.product_key,
    shade_key: it.shade_key,
    shade_name: it.shade_name,
    name: it.name,
    brand: it.brand,
    image_url: it.image_url,
    unit_price: it.unit_price,
    quantity: it.quantity,
    line_total: it.unit_price * it.quantity,
  }));

  const itemsClient = user_id ? supabase : createGuestHeaderClient(guest_token!);

  const { error: itemsErr } = await itemsClient
    .from("order_items")
    .insert(itemsToInsert);

  if (itemsErr) {
    console.error("ITEMS INSERT ERROR:", itemsErr);

    // rollback: best-effort delete header
    try {
      await supabase.from("orders").delete().eq("id", order_id);
    } catch (e) {
      console.warn("Rollback delete failed (RLS may block):", e);
    }

    return NextResponse.json(
      { error: "Failed to create order items.", details: itemsErr.message },
      { status: 500 }
    );
  }

  // -----------------------------
  // Success
  // -----------------------------
  return NextResponse.json(
    user_id ? { order_id } : { order_id, guest_token },
    { status: 200 }
  );
}

// Add BELOW your POST export in src/app/api/orders/route.ts

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // pagination
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(20, Math.max(5, Number(searchParams.get("pageSize") || "10")));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Optional: filter by status
  const status = (searchParams.get("status") || "").trim();

  let query = supabase
    .from("orders")
    .select("id,status,currency,total,subtotal,shipping_fee,created_at,shipping_name,shipping_city", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load orders", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      orders: data || [],
      page,
      pageSize,
      total: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
    },
    { status: 200 }
  );
}
