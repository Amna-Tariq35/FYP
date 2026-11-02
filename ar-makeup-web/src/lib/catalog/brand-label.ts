export function brandFoldKey(brand: string): string {
  return brand.trim().toLocaleLowerCase();
}

/** Use the same folded spelling the brand filter shows, when that label is known. */
export function foldedBrandLabel(
  brand: string | null | undefined,
  labels: readonly string[],
): string {
  const raw = (brand ?? "").trim();
  if (!raw) return "";
  const key = brandFoldKey(raw);
  const match = labels.find((label) => brandFoldKey(label) === key);
  return match ?? raw;
}
