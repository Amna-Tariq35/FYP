import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

const BUYABLE_STATUSES = ["paid", "processing", "shipped", "delivered"];

type OrderItem = {
  id: string;
  product_key: string;
  shade_key: string | null;
  shade_name: string | null;
  quantity: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "Order id is required." }, { status: 400 });
  }

  const { item_id: requestedItemId } = await request.json().catch(() => ({}));
  const admin = createSupabaseAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,user_id,status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: "Could not verify order ownership." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (!BUYABLE_STATUSES.includes(String(order.status).toLowerCase())) {
    return NextResponse.json({ error: "Only paid or completed orders can be bought again." }, { status: 409 });
  }

  let itemsQuery = admin
    .from("order_items")
    .select("id,product_key,shade_key,shade_name,quantity")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (typeof requestedItemId === "string" && requestedItemId) {
    itemsQuery = itemsQuery.eq("id", requestedItemId);
  }

  const { data: orderItems, error: itemsError } = await itemsQuery;
  if (itemsError) {
    return NextResponse.json({ error: "Could not load order items." }, { status: 500 });
  }
  if (!orderItems?.length) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  const results = await Promise.all((orderItems as OrderItem[]).map(async (item) => {
    const { data: product, error: productError } = await admin
      .from("makeup_products")
      .select("product_key,name,brand,image_url,price,is_active,stock_quantity")
      .eq("product_key", item.product_key)
      .maybeSingle();

    if (productError || !product || product.is_active === false || product.price === null) {
      return { item_id: item.id, product_key: item.product_key, quantity: item.quantity, available: false, reason: "Product is no longer available." };
    }

    let shadeName = item.shade_name;
    if (item.shade_key) {
      const { data: shade } = await admin
        .from("product_shades")
        .select("shade_name")
        .eq("product_key", item.product_key)
        .eq("shade_key", item.shade_key)
        .maybeSingle();
      if (!shade) {
        return { item_id: item.id, product_key: item.product_key, quantity: item.quantity, available: false, reason: "Selected shade is no longer available." };
      }
      shadeName = shade.shade_name;
    }

    if (Number(product.stock_quantity) < item.quantity) {
      return { item_id: item.id, product_key: item.product_key, quantity: item.quantity, available: false, reason: `Only ${product.stock_quantity} currently in stock.` };
    }

    return {
      item_id: item.id,
      product_key: product.product_key,
      shade_key: item.shade_key,
      shade_name: shadeName,
      quantity: item.quantity,
      available: true,
      name: product.name,
      brand: product.brand,
      image_url: product.image_url,
      price: Number(product.price),
      stock_quantity: Number(product.stock_quantity),
    };
  }));

  return NextResponse.json({
    order_id: orderId,
    items: results.filter((item) => item.available),
    unavailable: results.filter((item) => !item.available),
  });
}
