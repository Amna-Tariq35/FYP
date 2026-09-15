export const CATEGORY_GROUPS = {
  makeup: ["blush", "eyelashes", "eyeliner", "eyeshadow", "foundation", "highlighter", "lip_gloss", "lipstick", "mascara"],
  skincare: ["cleanser", "eye_cream", "lash_care", "moisturizer", "sunscreen", "treatment"],
} as const;

export type MainCategory = keyof typeof CATEGORY_GROUPS;
export type ProductCategory = (typeof CATEGORY_GROUPS)[MainCategory][number];

export function categoriesForMainCategory(mainCategory: string | null | undefined): readonly string[] {
  return CATEGORY_GROUPS[mainCategory as MainCategory] ?? [];
}

export function normalizeCategory(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isValidCategoryCombination(
  mainCategory: string | null | undefined,
  category: string | null | undefined,
): boolean {
  const normalizedMainCategory = normalizeCategory(mainCategory);
  const normalizedCategory = normalizeCategory(category);
  return categoriesForMainCategory(normalizedMainCategory).includes(normalizedCategory);
}

export function categoryLabel(value: string | null | undefined): string {
  return normalizeCategory(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
