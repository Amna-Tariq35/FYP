import { NextResponse } from "next/server";
import { getProductsByKeys } from "@/src/lib/catalog/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keys = (searchParams.get("keys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0 && key.length <= 200)
    .slice(0, 6);

  try {
    const products = await getProductsByKeys(keys);
    const byKey = new Map(products.map((product) => [product.product_key, product]));
    return NextResponse.json(
      { products: keys.map((key) => byKey.get(key)).filter(Boolean) },
      { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Catalog lookup failed:", error);
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }
}
