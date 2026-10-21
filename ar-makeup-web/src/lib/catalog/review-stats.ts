import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogSupabase } from "@/src/lib/catalog/catalog-client";
import type { MakeupProduct } from "@/src/types/catalog";

const REVIEW_KEY_BATCH = 40;
const REVIEW_PAGE_SIZE = 1000;

export type ReviewAggregate = { average: number; count: number };
export type ReviewAggregateResult =
  | { ok: true; map: Map<string, ReviewAggregate>; source: "view" | "reviews" }
  | { ok: false; source: "unavailable" };

type PostgrestError = { code?: string; message?: string; details?: string | null; hint?: string | null };

export function isMissingReviewStatsView(error: PostgrestError): boolean {
  const code = error.code ?? "";
  const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  if (!message.includes("product_review_stats")) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("not found") ||
    message.includes("permission denied")
  );
}

export function withReviewStats(
  product: MakeupProduct,
  aggregates: ReviewAggregateResult,
): MakeupProduct {
  if (!aggregates.ok) {
    return {
      ...product,
      rating_average: null,
      review_count: null,
      reviews_available: false,
    };
  }
  const stats = aggregates.map.get(product.product_key);
  return {
    ...product,
    rating_average: stats?.average ?? null,
    review_count: stats?.count ?? 0,
    reviews_available: true,
  };
}

function toAggregate(average: unknown, count: unknown): ReviewAggregate | null {
  const parsedCount = Number(count);
  const parsedAverage = Number(average);
  if (!Number.isFinite(parsedCount) || parsedCount < 0) return null;
  return {
    average: Number.isFinite(parsedAverage) ? Number(parsedAverage.toFixed(1)) : 0,
    count: parsedCount,
  };
}

async function readReviewStatsView(
  client: SupabaseClient,
): Promise<ReviewAggregateResult | "missing"> {
  const map = new Map<string, ReviewAggregate>();
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("product_review_stats")
      .select("product_key,average,count")
      .order("product_key", { ascending: true })
      .range(from, from + REVIEW_PAGE_SIZE - 1);
    if (error) {
      if (isMissingReviewStatsView(error)) return "missing";
      console.error("Error fetching product_review_stats:", error.message);
      return { ok: false, source: "unavailable" };
    }
    const rows = data ?? [];
    for (const row of rows) {
      const stats = toAggregate(row.average, row.count);
      if (!row.product_key || !stats || stats.count <= 0) continue;
      map.set(String(row.product_key), stats);
    }
    if (rows.length < REVIEW_PAGE_SIZE) break;
    from += REVIEW_PAGE_SIZE;
  }

  return { ok: true, map, source: "view" };
}

/** Current path: page product_reviews so a popular product is not cut at 1,000 rows. */
async function aggregateFromProductReviews(
  client: SupabaseClient,
  productKeys: string[],
): Promise<ReviewAggregateResult> {
  const keys = [...new Set(productKeys.filter(Boolean))];
  if (keys.length === 0) return { ok: true, map: new Map(), source: "reviews" };

  const grouped = new Map<string, number[]>();
  for (let offset = 0; offset < keys.length; offset += REVIEW_KEY_BATCH) {
    const batch = keys.slice(offset, offset + REVIEW_KEY_BATCH);
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from("product_reviews")
        .select("product_key,rating")
        .in("product_key", batch)
        .range(from, from + REVIEW_PAGE_SIZE - 1);
      if (error) {
        console.error("Error fetching review aggregates:", error.message);
        return { ok: false, source: "unavailable" };
      }
      const rows = data ?? [];
      for (const review of rows) {
        const ratings = grouped.get(review.product_key) ?? [];
        ratings.push(Number(review.rating));
        grouped.set(review.product_key, ratings);
      }
      if (rows.length < REVIEW_PAGE_SIZE) break;
      from += REVIEW_PAGE_SIZE;
    }
  }

  const map = new Map<string, ReviewAggregate>();
  for (const [key, ratings] of grouped) {
    if (ratings.length === 0) continue;
    map.set(key, {
      average: Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)),
      count: ratings.length,
    });
  }
  return { ok: true, map, source: "reviews" };
}

/**
 * One view read when product_review_stats exists. If PostgREST says the view
 * is missing, fall back to batched product_reviews for the requested keys.
 * A failed read stays unavailable so the UI does not pretend the count is zero.
 */
export async function getReviewAggregates(productKeys: string[]): Promise<ReviewAggregateResult> {
  const client = getCatalogSupabase();
  const keys = [...new Set(productKeys.filter(Boolean))];
  if (keys.length === 0) return { ok: true, map: new Map(), source: "view" };

  const fromView = await readReviewStatsView(client);
  if (fromView !== "missing") {
    if (!fromView.ok) return fromView;
    const map = new Map<string, ReviewAggregate>();
    for (const key of keys) {
      const stats = fromView.map.get(key);
      if (stats) map.set(key, stats);
    }
    return { ok: true, map, source: "view" };
  }

  console.warn("product_review_stats is unavailable; using batched product_reviews.");
  return aggregateFromProductReviews(client, keys);
}
