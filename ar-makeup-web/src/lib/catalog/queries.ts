import { supabase } from "@/src/lib/supabase/client";
import { MakeupProduct, ProductShade } from "@/src/types/catalog";

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
      .select("product_key,name,brand,category,description,image_url,price")
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

  return allProducts;
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
    .select("product_key,name,brand,category,description,image_url,price")
    .eq("product_key", product_key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as MakeupProduct | null;
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