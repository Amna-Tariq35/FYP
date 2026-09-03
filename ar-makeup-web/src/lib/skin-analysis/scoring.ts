import { Product, ConcernScores } from "./recommend";

// 1. Database Tags ko User Concerns ke sath Map karne ka Complete Dictionary
export const CONCERN_TAG_MAP: Record<string, string[]> = {
  acne: [
    "acne",
    "Acne Prone",
    "non_comedogenic",
    "sebum-control",
    "oil-free",
    "Exfoliating / Texture",
  ],
  redness: [
    "redness",
    "Redness & Soothing",
    "soothing",
    "calming",
    "rosacea",
    "irritation",
    "extreme-sensitivity",
  ],
  dryness: [
    "dryness",
    "hydration",
    "Hydrating",
    "plumping",
    "dehydration",
    "lightweight-hydration",
    "water-based",
  ],
  dark_spots: [
    "dark spots",
    "Dark Spots & Brightening",
    "brightening",
    "hyperpigmentation",
    "dullness",
    "glow",
    "sun-damage",
  ],
  aging: [
    "Anti-Aging",
    "anti-aging",
    "plumping",
    "barrier-support",
    "damaged barrier",
  ],
  oiliness: [
    "oiliness",
    "sebum-control",
    "oil-free",
    "matte finish",
    "lightweight",
    "water-based",
  ],
  sensitivity: [
    "sensitive_friendly",
    "fragrance_free",
    "allergy_tested",
    "soothing",
    "calming",
    "barrier-support",
  ],
  damaged_barrier: [
    "damaged barrier",
    "barrier-support",
    "soothing",
    "calming",
    "Daily Care",
  ],
};

// Return Result ka Structure
export interface ScoringResult {
  matchScore: number;
  matchedTags: string[];
  skinTypeMatched: boolean;
}

/**
 * Step 1: Product Scoring Algorithm (0 se 100 Points)
 *
 * Weightage Breakdown:
 * - Skin Type Compatibility: Max 35 Points
 * - User Concern Match (Tags Base): Max 65 Points
 */
export function calculateMatchScore(
  product: Product,
  userSkinType: string,
  // [UPDATED] Accept both Questionnaire Object OR Photo Array
  concernScores: ConcernScores | string[]
): ScoringResult {
  let totalScore = 0;
  const matchedTagsSet = new Set<string>();

  // Null-Safety: Database se missing arrays handle karna
  const rawSkinTypes = Array.isArray(product.skin_type) ? product.skin_type : [];
  const rawTags = Array.isArray(product.tags) ? product.tags : [];

  // ----------------------------------------------------
  // Part A: Skin Type Match (Max 35 Points)
  // ----------------------------------------------------
  const normalizedUserSkinType = userSkinType ? userSkinType.trim().toLowerCase() : "";
  const productSkinTypes = rawSkinTypes.map((st) => (st || "").trim().toLowerCase());

  const isUniversal =
    productSkinTypes.includes("all") ||
    productSkinTypes.includes("all skin types");
  const isExactSkinTypeMatch = productSkinTypes.includes(normalizedUserSkinType);

  let skinTypeMatched = false;

  if (isExactSkinTypeMatch) {
    totalScore += 35; // Perfect Match
    skinTypeMatched = true;
  } else if (isUniversal) {
    totalScore += 25; // Universal products match everyone well
    skinTypeMatched = true;
  } else {
    totalScore += 5; // Mild penalty for mismatch
  }

  // ----------------------------------------------------
  // Part B: Concern & Tag Match (Max 65 Points)
  // ----------------------------------------------------
  let totalWeightedScore = 0;
  let totalConcernWeight = 0;

  const productTagsLower = rawTags.map((t) => (t || "").toLowerCase());

  // [UPDATED] NORMALIZATION: Convert Array to Object if needed
  const normalizedConcerns: Record<string, number> = {};
  
  if (Array.isArray(concernScores)) {
    // Agar Photo Analysis se array aaya hai (e.g., ["acne", "oiliness"])
    concernScores.forEach((concern) => {
      normalizedConcerns[concern] = 1.0; // Default high weight for detected visual concerns
    });
  } else if (concernScores && typeof concernScores === "object") {
    // Agar Questionnaire se object aaya hai
    Object.assign(normalizedConcerns, concernScores);
  }

  for (const [concern, score] of Object.entries(normalizedConcerns)) {
    if (score <= 0) continue; // Agar concern ka score 0 hai to skip kar dein

    totalConcernWeight += score;

    // Is concern ke relevant tags search karein
    const relevantTags = CONCERN_TAG_MAP[concern.toLowerCase()] || [];
    let matchCountForConcern = 0;

    for (const tag of relevantTags) {
      if (productTagsLower.includes(tag.toLowerCase())) {
        matchCountForConcern++;

        // Matching original tag name save kar rahe hain UI / Reason Display ke liye
        const originalTag = rawTags.find(
          (t) => (t || "").toLowerCase() === tag.toLowerCase()
        );
        if (originalTag) matchedTagsSet.add(originalTag);
      }
    }

    // Single concern match calculation (1 matching tag = 70% efficiency, 2+ tags = 100%)
    if (matchCountForConcern > 0) {
      const matchEfficiency = Math.min(1, matchCountForConcern / 2);
      totalWeightedScore += score * matchEfficiency;
    }
  }

  // Concern score normalization out of 65
  if (totalConcernWeight > 0) {
    const concernRatio = totalWeightedScore / totalConcernWeight;
    totalScore += concernRatio * 65;
  } else {
    // Agar koi concern issue na ho to skin-type base product score safe 30 points gain karega
    totalScore += 30;
  }

  // Final score 0 - 100 range mein return karna
  const finalScore = Math.min(100, Math.round(totalScore));

  return {
    matchScore: finalScore,
    matchedTags: Array.from(matchedTagsSet),
    skinTypeMatched,
  };
}