export type MakeupBagSource = "manual" | "purchase" | "try_on";

export function bagItemKey(productKey: string, shadeKey?: string | null) {
  return `${productKey}__${shadeKey || ""}`;
}

export function normalizeShadeKey(shadeKey?: string | null) {
  return shadeKey && shadeKey !== "no-shade" ? shadeKey : "";
}
