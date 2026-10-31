import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getProductByKey } from "@/src/lib/catalog/queries";

export const dynamic = "force-dynamic";

type LogRow = {
  matched_product_key: string | null;
  matched_shade_key: string | null;
  matched_shade_name: string | null;
  matched_shade_hex: string | null;
};

export type SavedShadeMatch = {
  shadeName: string;
  shadeHex: string | null;
  shadeKey: string | null;
  productKey: string | null;
  productName: string | null;
  brand: string | null;
  price: number | null;
  imageUrl: string | null;
  inStock: boolean;
};

function cleanHex(value: string | null): string | null {
  if (!value) return null;
  const hex = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : null;
}

function missingTable(message: string): boolean {
  return /relation|does not exist|schema cache|could not find|42P01|PGRST205/i.test(message);
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Sign in to see your shade match." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("foundation_match_logs")
    .select("matched_product_key, matched_shade_key, matched_shade_name, matched_shade_hex")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    if (missingTable(error.message)) {
      return NextResponse.json({ shades: [] satisfies SavedShadeMatch[] });
    }
    console.error("[account/shade-match] log read failed");
    return NextResponse.json({ error: "Could not load your shade match." }, { status: 500 });
  }

  const seen = new Set<string>();
  const rows: LogRow[] = [];
  for (const row of (data ?? []) as LogRow[]) {
    const name = row.matched_shade_name?.trim() ?? "";
    if (!name) continue;
    const key = `${row.matched_product_key ?? ""}::${row.matched_shade_key ?? name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length === 3) break;
  }

  try {
    const shades: SavedShadeMatch[] = await Promise.all(
      rows.map(async (row) => {
        const productKey = row.matched_product_key?.trim() || null;
        const product = productKey ? await getProductByKey(productKey) : null;
        const inStock = Boolean(product && product.stock_quantity > 0 && product.is_active !== false);
        return {
          shadeName: row.matched_shade_name?.trim() || "Saved shade",
          shadeHex: cleanHex(row.matched_shade_hex),
          shadeKey: row.matched_shade_key,
          productKey: product ? product.product_key : null,
          productName: product?.name ?? null,
          brand: product?.brand?.trim() || null,
          price: typeof product?.price === "number" ? product.price : null,
          imageUrl: product?.image_url ?? null,
          inStock,
        };
      }),
    );
    return NextResponse.json({ shades });
  } catch {
    console.error("[account/shade-match] product lookup failed");
    return NextResponse.json({ error: "Could not load your shade match." }, { status: 500 });
  }
}
