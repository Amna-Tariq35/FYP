import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

const REPEAT_STATUSES = ["paid", "processing", "shipped", "delivered"];
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type Order = { id: string; created_at: string; status: string };
type OrderItem = { product_key: string; shade_key: string | null; shade_name: string | null; quantity: number; created_at: string };

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id,created_at,status")
    .eq("user_id", user.id)
    .in("status", REPEAT_STATUSES)
    .order("created_at", { ascending: false });
  if (ordersError) return NextResponse.json({ error: "Could not load order history." }, { status: 500 });

  const orderRows = (orders ?? []) as Order[];
  if (orderRows.length === 0) return NextResponse.json({ repeats: [] });

  const orderDates = new Map(orderRows.map((order) => [order.id, order.created_at]));
  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_key,shade_key,shade_name,quantity,created_at,order_id")
    .in("order_id", orderRows.map((order) => order.id));
  if (itemsError) return NextResponse.json({ error: "Could not load repeat items." }, { status: 500 });

  const groups = new Map<string, { product_key: string; shade_key: string | null; shade_name: string | null; purchase_count: number; total_quantity: number; last_ordered_at: string }>();
  for (const item of (items ?? []) as (OrderItem & { order_id: string })[]) {
    const key = `${item.product_key}::${item.shade_key ?? ""}`;
    const orderedAt = orderDates.get(item.order_id) ?? item.created_at;
    const current = groups.get(key);
    if (current) {
      current.purchase_count += 1;
      current.total_quantity += Number(item.quantity);
      if (new Date(orderedAt) > new Date(current.last_ordered_at)) current.last_ordered_at = orderedAt;
    } else {
      groups.set(key, {
        product_key: item.product_key,
        shade_key: item.shade_key,
        shade_name: item.shade_name,
        purchase_count: 1,
        total_quantity: Number(item.quantity),
        last_ordered_at: orderedAt,
      });
    }
  }

  const candidates = [...groups.values()].filter((item) =>
    item.purchase_count >= 2 || Date.now() - new Date(item.last_ordered_at).getTime() >= THIRTY_DAYS,
  );
  const repeats = await Promise.all(candidates.map(async (item) => {
    const { data: product } = await admin
      .from("makeup_products")
      .select("product_key,name,brand,image_url,price,is_active,stock_quantity")
      .eq("product_key", item.product_key)
      .maybeSingle();
    return {
      ...item,
      name: product?.name ?? item.product_key,
      brand: product?.brand ?? null,
      image_url: product?.image_url ?? null,
      price: product?.price === null || product?.price === undefined ? null : Number(product.price),
      stock_quantity: Number(product?.stock_quantity ?? 0),
      is_active: product?.is_active !== false,
    };
  }));

  repeats.sort((a, b) => new Date(b.last_ordered_at).getTime() - new Date(a.last_ordered_at).getTime());
  return NextResponse.json({ repeats });
}
