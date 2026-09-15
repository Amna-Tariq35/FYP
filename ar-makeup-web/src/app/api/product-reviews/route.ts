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
  if (userIds.length === 0) return new Set<string>();
  const admin = createSupabaseAdminClient();
  const { data: orders } = await admin
    .from("orders")
    .select("id,user_id")
    .in("user_id", userIds)
    .in("status", VERIFIED_STATUSES);
  if (!orders?.length) return new Set<string>();
  const { data: items } = await admin
    .from("order_items")
    .select("order_id")
    .eq("product_key", productKey)
    .in("order_id", orders.map((order) => order.id));
  const paidOrderIds = new Set((items ?? []).map((item) => item.order_id));
  return new Set(orders.filter((order) => paidOrderIds.has(order.id)).map((order) => order.user_id));
}

export async function GET(request: Request) {
  const productKey = new URL(request.url).searchParams.get("product_key")?.trim();
  if (!productKey) return NextResponse.json({ error: "product_key is required." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: reviews, error } = await supabase
    .from("product_reviews")
    .select("id,user_id,product_key,rating,body,created_at,updated_at")
    .eq("product_key", productKey)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  const verifiedUsers = await getVerifiedReviewUsers(productKey, (reviews ?? []).map((review) => review.user_id));
  const response = await Promise.all((reviews ?? []).map(async (review) => ({
    ...review,
    verified_purchase: verifiedUsers.has(review.user_id),
    is_mine: user?.id === review.user_id,
  })));
  return NextResponse.json({ reviews: response });
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

  const { data, error } = await supabase
    .from("product_reviews")
    .insert({ user_id: user.id, product_key: productKey, rating, body: reviewBody })
    .select("id,user_id,product_key,rating,body,created_at,updated_at")
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
  const { data, error } = await supabase.from("product_reviews").update({ rating, body: reviewBody, updated_at: new Date().toISOString() }).eq("id", reviewId).eq("user_id", user.id).select("id,user_id,product_key,rating,body,created_at,updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Review not found or update failed." }, { status: 404 });
  return NextResponse.json({ review: { ...data, verified_purchase: await getVerifiedPurchase(user.id, data.product_key), is_mine: true } });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Review id is required." }, { status: 400 });
  const { error } = await supabase.from("product_reviews").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete review." }, { status: 500 });
  return NextResponse.json({ success: true });
}
