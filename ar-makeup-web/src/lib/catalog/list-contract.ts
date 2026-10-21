import type { MakeupProduct } from "@/src/types/catalog";

export const CATALOG_PAGE_SIZE = 9;

export const CATALOG_SORTS = [
  "featured",
  "price-asc",
  "price-desc",
  "name-asc",
  "rating-desc",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];
export type CatalogMain = "all" | "makeup" | "skincare";

export type CatalogListQuery = {
  page: number;
  search: string;
  main: CatalogMain;
  category: string;
  brand: string;
  finish: string;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  skinFriendly: boolean;
  hasReviews: boolean;
  sort: CatalogSort;
};

export type CatalogFacets = {
  brands: string[];
  finishes: string[];
  categoriesByMain: Record<string, string[]>;
  maxPrice: number;
};

export type CatalogPageResult = {
  products: MakeupProduct[];
  total: number;
  page: number;
  pageSize: number;
  /** True when review aggregates failed. Counts are then unknown, not zero. */
  reviewsUnavailable: boolean;
};

type ParamSource = { get(name: string): string | null };

export function defaultCatalogQuery(): CatalogListQuery {
  return {
    page: 1,
    search: "",
    main: "all",
    category: "All",
    brand: "All",
    finish: "All",
    minPrice: null,
    maxPrice: null,
    inStock: false,
    skinFriendly: false,
    hasReviews: false,
    sort: "featured",
  };
}

export function normalizeCatalogQuery(input: CatalogListQuery): CatalogListQuery {
  const main: CatalogMain =
    input.main === "makeup" || input.main === "skincare" ? input.main : "all";
  const sort: CatalogSort = CATALOG_SORTS.includes(input.sort) ? input.sort : "featured";
  const page = Math.min(10000, Math.max(1, Math.floor(Number(input.page)) || 1));
  return {
    page,
    search: input.search.trim().slice(0, 80),
    main,
    category: input.category.trim() || "All",
    brand: input.brand.trim() || "All",
    finish: input.finish.trim() || "All",
    minPrice: finitePrice(input.minPrice),
    maxPrice: finitePrice(input.maxPrice),
    inStock: Boolean(input.inStock),
    skinFriendly: Boolean(input.skinFriendly),
    hasReviews: Boolean(input.hasReviews),
    sort,
  };
}

export function parseCatalogQuery(params: ParamSource): CatalogListQuery {
  const sortRaw = params.get("sort") ?? "featured";
  const mainRaw = params.get("main") ?? "all";
  return normalizeCatalogQuery({
    page: Number(params.get("page") ?? "1"),
    search: params.get("q") ?? "",
    main: mainRaw === "makeup" || mainRaw === "skincare" ? mainRaw : "all",
    category: params.get("category") || "All",
    brand: params.get("brand") || "All",
    finish: params.get("finish") || "All",
    minPrice: readPrice(params.get("min")),
    maxPrice: readPrice(params.get("max")),
    inStock: params.get("stock") === "1",
    skinFriendly: params.get("skin") === "1",
    hasReviews: params.get("reviews") === "1",
    sort: CATALOG_SORTS.includes(sortRaw as CatalogSort) ? (sortRaw as CatalogSort) : "featured",
  });
}

export function catalogQueryToSearchParams(query: CatalogListQuery): URLSearchParams {
  const normalized = normalizeCatalogQuery(query);
  const params = new URLSearchParams();
  if (normalized.page > 1) params.set("page", String(normalized.page));
  if (normalized.search) params.set("q", normalized.search);
  if (normalized.main !== "all") params.set("main", normalized.main);
  if (normalized.category !== "All") params.set("category", normalized.category);
  if (normalized.brand !== "All") params.set("brand", normalized.brand);
  if (normalized.finish !== "All") params.set("finish", normalized.finish);
  if (normalized.minPrice != null) params.set("min", String(normalized.minPrice));
  if (normalized.maxPrice != null) params.set("max", String(normalized.maxPrice));
  if (normalized.inStock) params.set("stock", "1");
  if (normalized.skinFriendly) params.set("skin", "1");
  if (normalized.hasReviews) params.set("reviews", "1");
  if (normalized.sort !== "featured") params.set("sort", normalized.sort);
  return params;
}

function finitePrice(value: number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function readPrice(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  return finitePrice(Number(value));
}
