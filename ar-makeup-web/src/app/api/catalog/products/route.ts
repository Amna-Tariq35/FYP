import { NextResponse } from "next/server";
import { getCatalogFacets, getCatalogPage } from "@/src/lib/catalog/queries";
import { parseCatalogQuery } from "@/src/lib/catalog/list-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const query = parseCatalogQuery(searchParams);
    const [page, facets] = await Promise.all([getCatalogPage(query), getCatalogFacets()]);
    return NextResponse.json(
      { ...page, facets },
      { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    console.error("Catalog page failed:", error);
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }
}
