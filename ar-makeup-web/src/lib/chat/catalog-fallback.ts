import type { UIMessage } from "ai";
import { getCatalogPage, getShadesByProductKey } from "@/src/lib/catalog/queries";
import { defaultCatalogQuery, normalizeCatalogQuery } from "@/src/lib/catalog/list-contract";
import { sanitizeSearch } from "@/src/lib/catalog/listing-constraints";
import type { MakeupProduct } from "@/src/types/catalog";

export const CHAT_CATALOG_CARD_LIMIT = 4;

export type ChatCatalogShade = {
  id: string;
  shade_key: string;
  shade_name: string;
  shade_hex?: string;
};

export type ChatCatalogCard = {
  id: string;
  product_key: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image_url?: string;
  finish?: string;
  skin_type?: string;
  product_shades?: ChatCatalogShade[];
};

export function lastUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user" || !Array.isArray(message.parts)) continue;
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text;
  }
  return "";
}

function skinTypeLabel(value: MakeupProduct["skin_type"]): string | undefined {
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join(", ");
    return joined || undefined;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

/** In-stock catalog matches for the shopper's last message. Empty when the text cannot be searched. */
export async function searchCatalogCards(text: string): Promise<ChatCatalogCard[]> {
  const search = sanitizeSearch(text);
  if (!search) return [];

  const page = await getCatalogPage(
    normalizeCatalogQuery({
      ...defaultCatalogQuery(),
      search,
      inStock: true,
    }),
  );

  const products = page.products
    .filter((product) => product.stock_quantity > 0 && product.product_key)
    .slice(0, CHAT_CATALOG_CARD_LIMIT);

  return Promise.all(products.map(toCard));
}

async function toCard(product: MakeupProduct): Promise<ChatCatalogCard> {
  let shades: ChatCatalogShade[] = [];
  try {
    const rows = await getShadesByProductKey(product.product_key);
    shades = rows
      .filter((shade) => shade.shade_key && shade.shade_name)
      .map((shade) => ({
        id: shade.shade_key,
        shade_key: shade.shade_key,
        shade_name: shade.shade_name,
        ...(shade.shade_hex ? { shade_hex: shade.shade_hex } : {}),
      }));
  } catch {
    shades = [];
  }

  const skinType = skinTypeLabel(product.skin_type);
  return {
    id: product.id,
    product_key: product.product_key,
    name: product.name,
    brand: product.brand?.trim() || "",
    category: product.category?.trim() || "",
    price: typeof product.price === "number" ? product.price : 0,
    ...(product.image_url ? { image_url: product.image_url } : {}),
    ...(product.finish ? { finish: product.finish } : {}),
    ...(skinType ? { skin_type: skinType } : {}),
    ...(shades.length > 0 ? { product_shades: shades } : {}),
  };
}
