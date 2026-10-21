import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";

const VERIFIED_STATUSES = ["paid", "processing", "shipped", "delivered"];

async function getVerifiedPurchase(userId: string, productKey: string) {
  const admin = createSupabaseAdminClient();
  const { data: orders } = await admin
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .in("status", VERIFIED_STATUSES);
  if (!orders?.length) return false;
  const { data: item } = await admin
    .from("order_items")
    .select("id")
    .eq("product_key", productKey)
    .in("order_id", orders.map((order) => order.id))
    .limit(1)
    .maybeSingle();
  return Boolean(item);
}

async function getVerifiedReviewUsers(productKey: string, userIds: string[]) {
  const verified = new Map<string, string | null>();
  if (userIds.length === 0) return verified;
  const admin = createSupabaseAdminClient();
  const ordered = await admin
    .from("orders")
    .select("id,user_id,created_at")
    .in("user_id", userIds)
    .in("status", VERIFIED_STATUSES)
    .order("created_at", { ascending: false });
  const fallback = ordered.error
    ? await admin
        .from("orders")
        .select("id,user_id")
        .in("user_id", userIds)
        .in("status", VERIFIED_STATUSES)
    : null;
  const orders = (fallback ? fallback.data : ordered.data) as Array<{
    id: string;
    user_id: string;
  }> | null;
  if (!orders?.length) return verified;
  const { data: items } = await admin
    .from("order_items")
    .select("order_id, shade_key")
    .eq("product_key", productKey)
    .in("order_id", orders.map((order) => order.id));
  const shadeByOrder = new Map<string, string | null>();
  for (const item of items ?? []) {
    const shade = typeof item.shade_key === "string" ? item.shade_key.trim() : "";
    const current = shadeByOrder.get(item.order_id);
    if (current) continue;
    shadeByOrder.set(item.order_id, shade && shade !== "no-shade" ? shade : null);
  }
  const shadeKeys = new Set<string>();
  for (const order of orders) {
    if (!shadeByOrder.has(order.id) || verified.has(order.user_id)) continue;
    const shadeKey = shadeByOrder.get(order.id) ?? null;
    verified.set(order.user_id, shadeKey);
    if (shadeKey) shadeKeys.add(shadeKey);
  }
  if (shadeKeys.size === 0) return verified;
  const { data: shades, error } = await admin
    .from("product_shades")
    .select("shade_key, shade_name")
    .eq("product_key", productKey)
    .in("shade_key", [...shadeKeys]);
  if (error || !shades) {
    for (const [userId] of verified) verified.set(userId, null);
    return verified;
  }
  const names = new Map(
    shades
      .filter((shade) => shade.shade_name?.trim())
      .map((shade) => [shade.shade_key, shade.shade_name.trim()]),
  );
  for (const [userId, shadeKey] of verified) {
    verified.set(userId, shadeKey ? names.get(shadeKey) ?? null : null);
  }
  return verified;
}

export async function GET(request: Request) {
  const productKey = new URL(request.url).searchParams.get("product_key")?.trim();
  if (!productKey) return NextResponse.json({ error: "product_key is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const { data: reviews, error } = await admin
    .from("product_reviews")
    .select("id,user_id,product_key,rating,body,created_at,updated_at")
    .eq("product_key", productKey)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  const verifiedUsers = await getVerifiedReviewUsers(productKey, (reviews ?? []).map((review) => review.user_id));
  const response = (reviews ?? []).map((review) => {
    const shadeName = verifiedUsers.get(review.user_id);
    return {
      id: review.id,
      rating: review.rating,
      body: review.body,
      created_at: review.created_at,
      verified_purchase: verifiedUsers.has(review.user_id),
      ...(typeof shadeName === "string" ? { shade_name: shadeName } : {}),
      is_mine: user?.id === review.user_id,
    };
  });
  const canReview = user ? await getVerifiedPurchase(user.id, productKey) : false;
  return NextResponse.json({
    reviews: response,
    signed_in: Boolean(user),
    can_review: canReview,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Sign in to write a review." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const productKey = typeof body.product_key === "string" ? body.product_key.trim() : "";
  const rating = Number(body.rating);
  const reviewBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!productKey || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Product and rating from 1 to 5 are required." }, { status: 400 });
  }

  const verified = await getVerifiedPurchase(user.id, productKey);
  if (!verified) return NextResponse.json({ error: "Only customers with a completed purchase can review this product." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .insert({ user_id: user.id, product_key: productKey, rating, body: reviewBody })
    .select("id,product_key,rating,body,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "You already reviewed this product." : error.message }, { status: 400 });
  return NextResponse.json({ review: { ...data, verified_purchase: true, is_mine: true } }, { status: 201 });
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const reviewId = typeof body.id === "string" ? body.id : "";
  const rating = Number(body.rating);
  const reviewBody = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (!reviewId || !Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: "Valid review id and rating are required." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("product_reviews").update({ rating, body: reviewBody, updated_at: new Date().toISOString() }).eq("id", reviewId).eq("user_id", user.id).select("id,product_key,rating,body,created_at,updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Review not found or update failed." }, { status: 404 });
  return NextResponse.json({ review: { ...data, verified_purchase: await getVerifiedPurchase(user.id, data.product_key), is_mine: true } });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Review id is required." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("product_reviews").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete review." }, { status: 500 });
  return NextResponse.json({ success: true });
}
