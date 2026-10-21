import type { ExactCategory, Product } from "./recommend";

const CATEGORY_MAP: Record<string, ExactCategory> = {
  cleanser: "Cleanser",
  eye_cream: "Eye cream",
  eye_care: "Eye cream",
  moisturizer: "Moisturizer",
  moisturiser: "Moisturizer",
  sunscreen: "sunscreen",
  spf: "sunscreen",
  treatment: "Treatment",
  serum: "Treatment",
};

/** DB tags/skin_type may be a real array, a JSON string, or a Postgres `{a,b}` literal. */
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // fall through to comma split
    }
  }

  const inner =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export function toExactCategory(value: unknown): ExactCategory | null {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return CATEGORY_MAP[key] ?? null;
}

export function normalizeCatalogProduct(row: Record<string, unknown>): Product | null {
  const category = toExactCategory(row.category);
  if (!category || typeof row.id !== "string") return null;
  return {
    id: row.id,
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    category,
    price: Number(row.price ?? 0),
    image_url: String(row.image_url ?? ""),
    skin_type: asStringList(row.skin_type),
    tags: asStringList(row.tags),
    ingredients: Array.isArray(row.ingredients)
      ? row.ingredients.map((item) => String(item)).join(", ")
      : String(row.ingredients ?? ""),
    am_safe: row.am_safe !== false,
    pm_safe: row.pm_safe !== false,
  };
}
