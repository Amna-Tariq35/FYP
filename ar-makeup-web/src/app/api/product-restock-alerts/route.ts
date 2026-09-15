import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
