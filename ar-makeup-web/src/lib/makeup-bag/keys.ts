export type MakeupBagSource = "manual" | "purchase" | "try_on";

/** One bag per user, matched by name. Live SQL has no is_default column. */
export const DEFAULT_BAG_NAME = "My Everyday Bag";

export function bagItemKey(productKey: string, shadeKey?: string | null) {
  return `${productKey}__${shadeKey || ""}`;
}

export function normalizeShadeKey(shadeKey?: string | null) {
  return shadeKey && shadeKey !== "no-shade" ? shadeKey : "";
}
