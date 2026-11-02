import type { UIMessage } from "ai";
import { searchChatProducts, type ChatSearchProduct } from "@/src/lib/chat/catalog-search";

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

function cardShades(product: ChatSearchProduct): ChatCatalogShade[] {
  return (product.product_shades ?? []).flatMap((shade) => {
    const shadeKey = shade.shade_key || shade.id;
    if (!shadeKey || !shade.shade_name) return [];
    return [
      {
        id: shadeKey,
        shade_key: shadeKey,
        shade_name: shade.shade_name,
        ...(shade.shade_hex ? { shade_hex: shade.shade_hex } : {}),
      },
    ];
  });
}

function toCard(product: ChatSearchProduct): ChatCatalogCard {
  const shades = cardShades(product);
  return {
    id: product.id,
    product_key: product.product_key,
    name: product.name,
    brand: product.brand.trim(),
    category: product.category.trim(),
    price: product.price,
    ...(product.image_url ? { image_url: product.image_url } : {}),
    ...(product.finish ? { finish: product.finish } : {}),
    ...(product.skin_type ? { skin_type: product.skin_type } : {}),
    ...(shades.length > 0 ? { product_shades: shades } : {}),
  };
}

/** In-stock catalog matches for the shopper's last message. Empty when nothing in the catalog fits. */
export async function searchCatalogCards(text: string): Promise<ChatCatalogCard[]> {
  const found = await searchChatProducts({ text });
  if (!found.ok) return [];
  return found.products.slice(0, CHAT_CATALOG_CARD_LIMIT).map(toCard);
}
