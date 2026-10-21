import { getCatalogSupabase } from "@/src/lib/catalog/catalog-client";

export {
  getCatalogFacets,
  getCatalogPage,
  getProductByKey,
  getProductsByKeys,
  getShadesByProductKey,
} from "@/src/lib/catalog/listing";

export async function getCategories(): Promise<string[]> {
  const { data, error } = await getCatalogSupabase().rpc("get_distinct_categories");

  if (error) {
    console.error("RPC Error (getCategories):", error.message);
    return [];
  }

  return (data ?? []).map((item: { category: string }) => item.category);
}
