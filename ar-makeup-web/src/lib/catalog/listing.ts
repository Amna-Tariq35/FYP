import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogSupabase } from "@/src/lib/catalog/catalog-client";
import { applyListingFilters, listingConstraints, type ListingConstraints } from "@/src/lib/catalog/listing-constraints";
import {
  CATALOG_PAGE_SIZE,
  normalizeCatalogQuery,
  type CatalogFacets,
  type CatalogListQuery,
  type CatalogPageResult,
  type CatalogSort,
} from "@/src/lib/catalog/list-contract";
import {
  getReviewAggregates,
  withReviewStats,
  type ReviewAggregate,
  type ReviewAggregateResult,
} from "@/src/lib/catalog/review-stats";
import type { MakeupProduct, ProductShade } from "@/src/types/catalog";

const PRODUCT_COLUMNS =
  "id,product_key,name,brand,category,main_category,description,image_url,price,is_skin_friendly,is_active,finish,skin_type,stock_quantity,low_stock_threshold";
const SCAN_PAGE = 1000;
const CACHE_SECONDS = 60;

type SlimProduct = {
  product_key: string;
  name: string;
  price: number | null;
  created_at: string | null;
};

type ProductRow = Record<string, unknown>;

function toProduct(row: ProductRow): MakeupProduct {
  return {
    id: String(row.id ?? ""),
    product_key: String(row.product_key ?? ""),
    name: String(row.name ?? ""),
    brand: (row.brand as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    main_category: (row.main_category as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    price: row.price == null ? null : Number(row.price),
    is_skin_friendly: (row.is_skin_friendly as boolean | null) ?? null,
    is_active: (row.is_active as boolean | null) ?? null,
    finish: (row.finish as string | null) ?? null,
    skin_type: (row.skin_type as MakeupProduct["skin_type"]) ?? null,
    stock_quantity: Number(row.stock_quantity ?? 0),
    low_stock_threshold: Number(row.low_stock_threshold ?? 0),
    rating_average: null,
    review_count: null,
  };
}

type OrderedQuery = {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderedQuery;
  range: (from: number, to: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
    count: number | null;
  }>;
};

function applySort(query: unknown, sort: CatalogSort): OrderedQuery {
  const next = query as OrderedQuery;
  if (sort === "price-asc") {
    return next.order("price", { ascending: true, nullsFirst: true }).order("product_key", { ascending: true });
  }
  if (sort === "price-desc") {
    return next.order("price", { ascending: false, nullsFirst: false }).order("product_key", { ascending: true });
  }
  if (sort === "name-asc") {
    return next.order("name", { ascending: true }).order("product_key", { ascending: true });
  }
  return next.order("created_at", { ascending: false }).order("product_key", { ascending: true });
}

function priceOf(product: SlimProduct): number {
  return typeof product.price === "number" && Number.isFinite(product.price) ? product.price : 0;
}

function compareSlim(sort: CatalogSort, stats: ReviewAggregateResult) {
  return (a: SlimProduct, b: SlimProduct) => {
    if (sort === "price-asc" || sort === "price-desc") {
      const delta = priceOf(a) - priceOf(b);
      if (delta !== 0) return sort === "price-asc" ? delta : -delta;
    } else if (sort === "name-asc") {
      const delta = (a.name || "").localeCompare(b.name || "");
      if (delta !== 0) return delta;
    } else if (sort === "rating-desc") {
      const aStats = stats.ok ? stats.map.get(a.product_key) : undefined;
      const bStats = stats.ok ? stats.map.get(b.product_key) : undefined;
      const aReviewed = hasReviewScore(aStats, stats.ok);
      const bReviewed = hasReviewScore(bStats, stats.ok);
      if (aReviewed !== bReviewed) return aReviewed ? -1 : 1;
      if (aReviewed && bReviewed && aStats && bStats) {
        const byScore = bStats.average - aStats.average;
        if (byScore !== 0) return byScore;
        const byCount = bStats.count - aStats.count;
        if (byCount !== 0) return byCount;
      }
    } else {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      if (aTime !== bTime) return bTime - aTime;
    }
    return a.product_key.localeCompare(b.product_key);
  };
}

function hasReviewScore(stats: ReviewAggregate | undefined, available: boolean) {
  return Boolean(
    available && stats && stats.count > 0 && typeof stats.average === "number" && !Number.isNaN(stats.average),
  );
}

async function scanMatching(client: SupabaseClient, constraints: ListingConstraints): Promise<SlimProduct[]> {
  const rows: SlimProduct[] = [];
  let page = 0;
  while (true) {
    const from = page * SCAN_PAGE;
    const to = from + SCAN_PAGE - 1;
    const request = (applyListingFilters(
      client.from("makeup_products").select("product_key,name,price,created_at"),
      constraints,
    ) as unknown as OrderedQuery)
      .order("product_key", { ascending: true })
      .range(from, to);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as SlimProduct[];
    rows.push(
      ...batch.map((row) => ({
        product_key: String(row.product_key),
        name: String(row.name ?? ""),
        price: row.price == null ? null : Number(row.price),
        created_at: row.created_at ?? null,
      })),
    );
    if (batch.length < SCAN_PAGE) break;
    page += 1;
  }
  return rows;
}

async function hydrateProducts(
  client: SupabaseClient,
  keys: string[],
  aggregates: ReviewAggregateResult,
): Promise<MakeupProduct[]> {
  if (keys.length === 0) return [];
  const { data, error } = await client
    .from("makeup_products")
    .select(PRODUCT_COLUMNS)
    .eq("is_active", true)
    .in("product_key", keys);
  if (error) throw new Error(error.message);
  const byKey = new Map((data ?? []).map((row) => {
    const product = withReviewStats(toProduct(row as ProductRow), aggregates);
    return [product.product_key, product] as const;
  }));
  return keys.map((key) => byKey.get(key)).filter((product): product is MakeupProduct => Boolean(product));
}

async function loadDirectPage(
  client: SupabaseClient,
  query: CatalogListQuery,
  constraints: ListingConstraints,
): Promise<CatalogPageResult> {
  const from = (query.page - 1) * CATALOG_PAGE_SIZE;
  const to = from + CATALOG_PAGE_SIZE - 1;
  const request = applySort(
    applyListingFilters(client.from("makeup_products").select(PRODUCT_COLUMNS, { count: "exact" }), constraints),
    query.sort === "rating-desc" ? "featured" : query.sort,
  ).range(from, to);
  const { data, error, count } = await request;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProductRow[];
  const aggregates = await getReviewAggregates(rows.map((row) => String(row.product_key)));
  return {
    products: rows.map((row) => withReviewStats(toProduct(row), aggregates)),
    total: count ?? rows.length,
    page: query.page,
    pageSize: CATALOG_PAGE_SIZE,
    reviewsUnavailable: !aggregates.ok,
  };
}

async function loadReviewAwarePage(
  client: SupabaseClient,
  query: CatalogListQuery,
  constraints: ListingConstraints,
): Promise<CatalogPageResult> {
  const matching = await scanMatching(client, constraints);
  const stats = await getReviewAggregates(matching.map((row) => row.product_key));
  if (!stats.ok && query.hasReviews) {
    return {
      products: [],
      total: 0,
      page: query.page,
      pageSize: CATALOG_PAGE_SIZE,
      reviewsUnavailable: true,
    };
  }

  const sort = !stats.ok && query.sort === "rating-desc" ? "featured" : query.sort;
  let rows = matching;
  if (query.hasReviews && stats.ok) {
    rows = rows.filter((row) => (stats.map.get(row.product_key)?.count ?? 0) > 0);
  }
  rows.sort(compareSlim(sort, stats));
  const start = (query.page - 1) * CATALOG_PAGE_SIZE;
  const pageKeys = rows.slice(start, start + CATALOG_PAGE_SIZE).map((row) => row.product_key);
  return {
    products: await hydrateProducts(client, pageKeys, stats),
    total: rows.length,
    page: query.page,
    pageSize: CATALOG_PAGE_SIZE,
    reviewsUnavailable: !stats.ok,
  };
}

async function loadCatalogPage(query: CatalogListQuery): Promise<CatalogPageResult> {
  const normalized = normalizeCatalogQuery(query);
  const constraints = listingConstraints(normalized);
  if (constraints.empty) {
    return {
      products: [],
      total: 0,
      page: normalized.page,
      pageSize: CATALOG_PAGE_SIZE,
      reviewsUnavailable: false,
    };
  }
  const client = getCatalogSupabase();
  const needsReviewSet = normalized.hasReviews || normalized.sort === "rating-desc";
  if (!needsReviewSet) return loadDirectPage(client, normalized, constraints);
  return loadReviewAwarePage(client, normalized, constraints);
}

async function loadFacets(): Promise<CatalogFacets> {
  const client = getCatalogSupabase();
  const brands = new Set<string>();
  const finishes = new Set<string>();
  const categoriesByMain: Record<string, Set<string>> = {};
  let maxPrice = 1;
  let page = 0;

  while (true) {
    const from = page * SCAN_PAGE;
    const to = from + SCAN_PAGE - 1;
    const { data, error } = await client
      .from("makeup_products")
      .select("brand,finish,category,main_category,price")
      .eq("is_active", true)
      .order("product_key", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const brand = typeof row.brand === "string" ? row.brand.trim() : "";
      const finish = typeof row.finish === "string" ? row.finish.trim() : "";
      const category = typeof row.category === "string" ? row.category.trim() : "";
      const main = typeof row.main_category === "string" ? row.main_category.trim().toLowerCase() : "";
      if (brand) brands.add(brand);
      if (finish) finishes.add(finish);
      if (category) {
        const bucket = categoriesByMain[main] ?? new Set<string>();
        bucket.add(category);
        categoriesByMain[main] = bucket;
      }
      const price = Number(row.price);
      if (Number.isFinite(price) && price > maxPrice) maxPrice = price;
    }
    if (rows.length < SCAN_PAGE) break;
    page += 1;
  }

  return {
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    finishes: [...finishes].sort((a, b) => a.localeCompare(b)),
    categoriesByMain: Object.fromEntries(
      Object.entries(categoriesByMain).map(([main, values]) => [main, [...values].sort((a, b) => a.localeCompare(b))]),
    ),
    maxPrice: Math.ceil(maxPrice),
  };
}

async function loadProductByKey(productKey: string): Promise<MakeupProduct | null> {
  const client = getCatalogSupabase();
  const { data, error } = await client
    .from("makeup_products")
    .select(PRODUCT_COLUMNS)
    .eq("product_key", productKey)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const aggregates = await getReviewAggregates([productKey]);
  return withReviewStats(toProduct(data as ProductRow), aggregates);
}

async function loadShades(productKey: string): Promise<ProductShade[]> {
  const client = getCatalogSupabase();
  const { data, error } = await client
    .from("product_shades")
    .select("shade_key,product_key,shade_name,shade_hex")
    .eq("product_key", productKey)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductShade[];
}

async function loadProductsByKeys(joinedKeys: string): Promise<MakeupProduct[]> {
  const keys = [...new Set(joinedKeys.split(",").map((key) => key.trim()).filter(Boolean))].slice(0, 6);
  if (keys.length === 0) return [];
  const client = getCatalogSupabase();
  const aggregates = await getReviewAggregates(keys);
  return hydrateProducts(client, keys, aggregates);
}

const readCatalogPage = unstable_cache(loadCatalogPage, ["catalog-page-v2"], { revalidate: CACHE_SECONDS });
const readCatalogFacets = unstable_cache(loadFacets, ["catalog-facets-v1"], { revalidate: CACHE_SECONDS });
const readProductByKey = unstable_cache(loadProductByKey, ["catalog-product-v2"], { revalidate: CACHE_SECONDS });
const readShades = unstable_cache(loadShades, ["catalog-shades-v1"], { revalidate: CACHE_SECONDS });
const readProductsByKeys = unstable_cache(loadProductsByKeys, ["catalog-keys-v1"], { revalidate: CACHE_SECONDS });

export function getCatalogPage(query: CatalogListQuery): Promise<CatalogPageResult> {
  return readCatalogPage(normalizeCatalogQuery(query));
}

export function getCatalogFacets(): Promise<CatalogFacets> {
  return readCatalogFacets();
}

export function getProductByKey(productKey: string): Promise<MakeupProduct | null> {
  return readProductByKey(productKey);
}

export function getShadesByProductKey(productKey: string): Promise<ProductShade[]> {
  return readShades(productKey);
}

export function getProductsByKeys(keys: string[]): Promise<MakeupProduct[]> {
  const joined = [...new Set(keys.map((key) => key.trim()).filter(Boolean))].sort().join(",");
  return readProductsByKeys(joined);
}
