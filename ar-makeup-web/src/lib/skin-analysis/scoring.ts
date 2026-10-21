import { Product, ConcernScores } from "./recommend";
import { CONCERN_TAG_MAP, canonicalConcern, clampSeverity } from "./contract";
import { asStringList } from "./product-shape";

export { CONCERN_TAG_MAP };

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
  const rawSkinTypes = asStringList(product.skin_type);
  const rawTags = asStringList(product.tags);

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

  const normalizedConcerns: Record<string, number> = {};

  if (Array.isArray(concernScores)) {
    concernScores.forEach((concern) => {
      const tag = canonicalConcern(concern);
      if (tag) normalizedConcerns[tag] = Math.max(normalizedConcerns[tag] ?? 0, 0.8);
    });
  } else if (concernScores && typeof concernScores === "object") {
    const bag = concernScores as Record<string, unknown> & {
      concerns?: { tag?: string; severity?: number }[];
      severity_scores?: Record<string, unknown>;
    };
    if (Array.isArray(bag.concerns)) {
      for (const item of bag.concerns) {
        const tag = canonicalConcern(item?.tag);
        if (!tag) continue;
        normalizedConcerns[tag] = Math.max(
          normalizedConcerns[tag] ?? 0,
          clampSeverity(item?.severity, 0.6),
        );
      }
    } else if (bag.severity_scores && typeof bag.severity_scores === "object") {
      for (const [key, value] of Object.entries(bag.severity_scores)) {
        const tag = canonicalConcern(key);
        if (!tag) continue;
        normalizedConcerns[tag] = clampSeverity(value, 0.5);
      }
    } else {
      for (const [key, value] of Object.entries(bag)) {
        const tag = canonicalConcern(key);
        const severity = clampSeverity(value, -1);
        if (!tag || severity <= 0) continue;
        normalizedConcerns[tag] = severity;
      }
    }
  }

  for (const [concern, score] of Object.entries(normalizedConcerns)) {
    if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) continue;

    totalConcernWeight += score;

    // Is concern ke relevant tags search karein
    const relevantTags = CONCERN_TAG_MAP[concern as keyof typeof CONCERN_TAG_MAP] || [];
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