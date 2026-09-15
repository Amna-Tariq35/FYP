import { supabase } from "@/src/lib/supabase/client";
import { MakeupProduct, ProductShade } from "@/src/types/catalog";

async function getReviewAggregates(productKeys: string[]) {
  if (productKeys.length === 0) return new Map<string, { average: number; count: number }>();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("product_key,rating")
    .in("product_key", productKeys);
  if (error) {
    console.error("Error fetching review aggregates:", error.message);
    return new Map<string, { average: number; count: number }>();
  }
  const grouped = new Map<string, number[]>();
  for (const review of data ?? []) {
    const ratings = grouped.get(review.product_key) ?? [];
    ratings.push(Number(review.rating));
    grouped.set(review.product_key, ratings);
  }
  return new Map([...grouped].map(([key, ratings]) => [key, {
    average: Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)),
    count: ratings.length,
  }]));
}

/**
 * Fetch ALL products by handling Supabase's 1,000 row server limit using batching.
 */
export async function getProducts(): Promise<MakeupProduct[]> {
  let allProducts: MakeupProduct[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("makeup_products")
      .select("id,product_key,name,brand,category,main_category,description,image_url,price,is_skin_friendly,is_active,finish,stock_quantity,low_stock_threshold")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching products batch:", error.message);
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allProducts = [...allProducts, ...(data as MakeupProduct[])];
      
      // Agar fetch kiye gaye items 1,000 se kam hain, iska matlab saara data aa chuka hai
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  const aggregates = await getReviewAggregates(allProducts.map((product) => product.product_key));
  return allProducts.map((product) => ({
    ...product,
    rating_average: aggregates.get(product.product_key)?.average ?? null,
    review_count: aggregates.get(product.product_key)?.count ?? 0,
  }));
}

/**
 * Distinct Categories fetch karne ke liye function (RPC Call)
 */
export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_distinct_categories");

  if (error) {
    console.error("RPC Error (getCategories):", error.message);
    return [];
  }

  return (data ?? []).map((item: { category: string }) => item.category);
}

export async function getProductByKey(product_key: string): Promise<MakeupProduct | null> {
  const { data, error } = await supabase
    .from("makeup_products")
    .select("id,product_key,name,brand,category,main_category,description,image_url,price,is_skin_friendly,is_active,finish,stock_quantity,low_stock_threshold")
    .eq("product_key", product_key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const aggregates = await getReviewAggregates([product_key]);
  return {
    ...(data as MakeupProduct),
    rating_average: aggregates.get(product_key)?.average ?? null,
    review_count: aggregates.get(product_key)?.count ?? 0,
  };
}

export async function getShadesByProductKey(product_key: string): Promise<ProductShade[]> {
  const { data, error } = await supabase
    .from("product_shades")
    .select("shade_key,product_key,shade_name,shade_hex")
    .eq("product_key", product_key)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProductShade[];
}