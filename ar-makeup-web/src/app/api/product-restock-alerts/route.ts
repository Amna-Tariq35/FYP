import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  const serverClient = await createSupabaseServerClient();
  const { data: auth } = await serverClient.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to see your restock alerts." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const withDate = await admin
    .from("product_restock_alerts")
    .select("id, product_key, shade_key, created_at")
    .eq("user_id", userId)
    .is("notified_at", null)
    .order("created_at", { ascending: false });

  const fallback = withDate.error
    ? await admin
        .from("product_restock_alerts")
        .select("id, product_key, shade_key")
        .eq("user_id", userId)
        .is("notified_at", null)
    : null;
  if ((fallback ?? withDate).error) {
    return NextResponse.json({ error: "Could not load restock alerts." }, { status: 500 });
  }

  const rows = ((fallback ? fallback.data : withDate.data) ?? []) as Array<{
    id: string;
    product_key: string;
    shade_key: string | null;
    created_at?: string | null;
  }>;
  const productKeys = [...new Set(rows.map((row) => row.product_key).filter(Boolean))];
  const shadeKeys = [...new Set(rows.map((row) => row.shade_key).filter(Boolean))];
  const names = new Map<string, string>();
  const shadeNames = new Map<string, string>();

  if (productKeys.length) {
    const { data: products } = await admin
      .from("makeup_products")
      .select("product_key, name")
      .in("product_key", productKeys);
    for (const product of products ?? []) names.set(product.product_key, product.name);
  }
  if (shadeKeys.length && productKeys.length) {
    const { data: shades } = await admin
      .from("product_shades")
      .select("product_key, shade_key, shade_name")
      .in("product_key", productKeys)
      .in("shade_key", shadeKeys);
    for (const shade of shades ?? []) {
      if (shade.shade_name) shadeNames.set(`${shade.product_key}__${shade.shade_key}`, shade.shade_name);
    }
  }

  return NextResponse.json({
    alerts: rows.map((row) => ({
      id: row.id,
      product_key: row.product_key,
      product_name: names.get(row.product_key) || row.product_key,
      shade_name: row.shade_key ? shadeNames.get(`${row.product_key}__${row.shade_key}`) ?? null : null,
      created_at: "created_at" in row ? row.created_at ?? null : null,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productKey = typeof body.product_key === "string" ? body.product_key.trim() : "";
    const shadeKey = typeof body.shade_key === "string" && body.shade_key.trim()
      ? body.shade_key.trim()
      : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!productKey) {
      return NextResponse.json({ error: "Product is required." }, { status: 400 });
    }

    const serverClient = await createSupabaseServerClient();
    const [{ data: user }, { data: product, error: productError }] = await Promise.all([
      serverClient.auth.getUser(),
      serverClient
        .from("makeup_products")
        .select("product_key,stock_quantity,is_active")
        .eq("product_key", productKey)
        .maybeSingle(),
    ]);

    if (productError) throw productError;
    if (!product || product.is_active === false) {
      return NextResponse.json({ error: "Product is unavailable." }, { status: 404 });
    }
    if (product.stock_quantity > 0) {
      return NextResponse.json({ error: "This product is already in stock." }, { status: 409 });
    }

    const userId = user?.user?.id ?? null;
    const recipientEmail = userId ? (user.user?.email ?? null) : email;
    if (!userId && !isValidEmail(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    let existing = admin
      .from("product_restock_alerts")
      .select("id")
      .eq("product_key", productKey)
      .is("notified_at", null)
      .limit(1);
    existing = userId ? existing.eq("user_id", userId) : existing.ilike("email", email);
    if (shadeKey) existing = existing.eq("shade_key", shadeKey);
    else existing = existing.is("shade_key", null);

    const { data: duplicate, error: duplicateError } = await existing.maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return NextResponse.json({ success: true, alreadySubscribed: true });

    const { error: insertError } = await admin.from("product_restock_alerts").insert({
      user_id: userId,
      email: recipientEmail,
      product_key: productKey,
      shade_key: shadeKey,
    });
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, alreadySubscribed: false });
  } catch (error) {
    console.error("Restock alert subscription failed", error);
    return NextResponse.json({ error: "Could not save restock alert." }, { status: 500 });
  }
}
