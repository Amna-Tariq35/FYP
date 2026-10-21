import { ALLERGY_OPTIONS, type AllergyId } from "./contract";
import { asStringList } from "./product-shape";
import type { ConcernScores, ExactCategory, Product, RecommendedProduct } from "./recommend";
import { calculateMatchScore } from "./scoring";

const AM_ORDER: ExactCategory[] = [
  "Cleanser",
  "Treatment",
  "Eye cream",
  "Moisturizer",
  "sunscreen",
];

const RETINOID_WORDS = ["retinol", "retinal", "retinoid", "tretinoin", "adapalene"];
const ACID_WORDS = ["glycolic", "salicylic", "lactic acid"];

export type SafetyContext = {
  allergies?: string[];
  pregnant?: boolean;
  skinType?: string;
};

function ingredientText(product: Product) {
  const raw = (product as Product & { ingredients?: unknown }).ingredients;
  if (Array.isArray(raw)) return raw.join(" ").toLowerCase();
  return String(raw ?? "").toLowerCase();
}

export function isProductSafe(product: Product, safety: SafetyContext) {
  const text = ingredientText(product);
  const tags = asStringList(product.tags).map((t) => t.toLowerCase());

  for (const id of safety.allergies ?? []) {
    const option = ALLERGY_OPTIONS.find((o) => o.id === id);
    if (!option) continue;
    if (option.keywords.some((word) => text.includes(word) || tags.includes(word))) {
      return false;
    }
  }

  if (safety.pregnant && RETINOID_WORDS.some((word) => text.includes(word))) {
    return false;
  }

  const sensitive =
    safety.skinType === "Sensitive" || (safety.allergies ?? []).includes("fragrance" as AllergyId);
  if (sensitive && (tags.includes("fragrance") || text.includes("parfum"))) {
    return false;
  }

  return true;
}

function conflicts(a: Product, b: Product) {
  const left = ingredientText(a);
  const right = ingredientText(b);
  const leftRetinoid = RETINOID_WORDS.some((w) => left.includes(w));
  const rightRetinoid = RETINOID_WORDS.some((w) => right.includes(w));
  const leftAcid = ACID_WORDS.some((w) => left.includes(w));
  const rightAcid = ACID_WORDS.some((w) => right.includes(w));
  return (leftRetinoid && rightAcid) || (rightRetinoid && leftAcid);
}

function pick(
  products: Product[],
  category: ExactCategory,
  am: boolean,
  skinType: string,
  concerns: ConcernScores | string[],
  safety: SafetyContext,
  already: Product[],
): RecommendedProduct | null {
  const ranked = products
    .filter((p) => p.category === category)
    .filter((p) => (am ? p.am_safe !== false : p.pm_safe !== false))
    .filter((p) => isProductSafe(p, safety))
    .filter((p) => !already.some((chosen) => conflicts(chosen, p)))
    .map((p) => {
      const scored = calculateMatchScore(p, skinType, concerns);
      return { ...p, matchScore: scored.matchScore, matchReason: "" };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  const best = ranked[0];
  if (!best) return null;
  return {
    ...best,
    matchReason: `Selected for your ${skinType.toLowerCase()} profile from the highest-scoring ${category.toLowerCase()} options.`,
  };
}

export function buildDeterministicRoutine(
  products: Product[],
  skinType: string,
  concerns: ConcernScores | string[],
  safety: SafetyContext = {},
) {
  const am: RecommendedProduct[] = [];
  const pm: RecommendedProduct[] = [];

  for (const category of AM_ORDER) {
    const morning = pick(products, category, true, skinType, concerns, safety, am);
    if (morning) am.push(morning);
    if (category !== "sunscreen") {
      const night = pick(products, category, false, skinType, concerns, safety, pm);
      if (night) pm.push(night);
    }
  }

  return {
    amRoutine: am,
    pmRoutine: pm,
    summary: `This routine is built directly from your ${skinType.toLowerCase()} profile and the concerns you shared, using product scores rather than a generated guess.`,
    source: "rules" as const,
  };
}
