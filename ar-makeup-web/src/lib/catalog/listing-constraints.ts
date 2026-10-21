import { categoriesForMainCategory, normalizeCategory } from "@/src/lib/catalog/category-taxonomy";
import type { CatalogListQuery } from "@/src/lib/catalog/list-contract";

/**
 * Filters that the catalog query must apply. `empty` means the combination
 * cannot match (a skincare department plus a makeup category). Callers must
 * not drop `mainCategory` and still apply `category`.
 */
export type ListingConstraints = {
  empty: boolean;
  mainCategory: "makeup" | "skincare" | null;
  category: string | null;
  brand: string | null;
  finish: string | null;
  search: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  skinFriendly: boolean;
};

export function listingConstraints(query: CatalogListQuery): ListingConstraints {
  const mainCategory =
    query.main === "makeup" || query.main === "skincare" ? query.main : null;
  const categoryRaw = query.category.trim();
  const category =
    !categoryRaw || categoryRaw.toLowerCase() === "all" ? null : normalizeCategory(categoryRaw);
  const brand = query.brand.trim();
  const finish = query.finish.trim();
  let minPrice = query.minPrice;
  let maxPrice = query.maxPrice;
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    const swap = minPrice;
    minPrice = maxPrice;
    maxPrice = swap;
  }

  const categoryOutsideMain = Boolean(
    mainCategory && category && !categoriesForMainCategory(mainCategory).includes(category),
  );

  return {
    empty: categoryOutsideMain,
    mainCategory,
    category,
    brand: !brand || brand.toLowerCase() === "all" ? null : brand,
    finish: !finish || finish.toLowerCase() === "all" ? null : finish,
    search: sanitizeSearch(query.search),
    minPrice,
    maxPrice,
    inStock: query.inStock,
    skinFriendly: query.skinFriendly,
  };
}

export function sanitizeSearch(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/[%_\\,()."']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || null;
}

type FilterQuery = {
  eq: (column: string, value: unknown) => FilterQuery;
  gt: (column: string, value: unknown) => FilterQuery;
  gte: (column: string, value: unknown) => FilterQuery;
  lte: (column: string, value: unknown) => FilterQuery;
  or: (filters: string) => FilterQuery;
};

/**
 * Every public catalog read goes through this so a department filter cannot
 * be forgotten on one of the listing paths. The query is cast through a small
 * filter shape so Supabase's builder types are not instantiated here.
 */
export function applyListingFilters(query: unknown, constraints: ListingConstraints): FilterQuery {
  let next = query as unknown as FilterQuery;
  next = next.eq("is_active", true);
  if (constraints.empty) {
    return next.eq("main_category", "__no_such_department__");
  }
  if (constraints.mainCategory) {
    next = next.eq("main_category", constraints.mainCategory);
  }
  if (constraints.category) {
    next = next.eq("category", constraints.category);
  }
  if (constraints.brand) {
    next = next.eq("brand", constraints.brand);
  }
  if (constraints.finish) {
    next = next.eq("finish", constraints.finish);
  }
  const searchPattern = constraints.search ? `"%${constraints.search}%"` : null;
  const min = constraints.minPrice;
  const max = constraints.maxPrice;
  const priceActive = min != null || max != null;
  const priceMin = min ?? 0;
  const priceMax = max ?? Number.MAX_SAFE_INTEGER;
  const includeNullPrices = priceActive && priceMin <= 0;

  if (searchPattern && includeNullPrices) {
    next = next.or(
      `and(or(name.ilike.${searchPattern},brand.ilike.${searchPattern}),or(price.lte.${priceMax},price.is.null))`,
    );
  } else if (searchPattern) {
    next = next.or(`name.ilike.${searchPattern},brand.ilike.${searchPattern}`);
  } else if (includeNullPrices) {
    next = next.or(`price.lte.${priceMax},price.is.null`);
  }

  if (priceActive && !includeNullPrices) {
    next = next.gte("price", priceMin).lte("price", priceMax);
  }
  if (constraints.inStock) {
    next = next.gt("stock_quantity", 0);
  }
  if (constraints.skinFriendly) {
    next = next.eq("is_skin_friendly", true);
  }
  return next;
}
