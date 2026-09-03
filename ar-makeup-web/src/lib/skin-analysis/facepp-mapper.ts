export function mapFaceppResponseToDbSchema(faceppData: any) {
  if (!faceppData || !faceppData.result) {
    throw new Error("Invalid Face++ response format");
  }

  const result = faceppData.result;

  // 1. Map Skin Type
  // FIXED — official docs (confirmed): 0 = Oily, 1 = Dry, 2 = Normal, 3 = Mixed/Combination.
  // (Previous version had 0 and 2 swapped, which would have flipped Oily <-> Normal.)
  let skinType = "Normal";
  const faceppSkinType = result.skin_type; // per your JSON sample, this is a direct integer

  if (faceppSkinType === 0) skinType = "Oily";
  else if (faceppSkinType === 1) skinType = "Dry";
  else if (faceppSkinType === 3) skinType = "Combination";
  // faceppSkinType === 2 -> stays "Normal" (default above)

  // 2. Map Skin Concerns
  const CONFIDENCE_THRESHOLD = 0.5;
  const primaryConcerns: string[] = [];

  // FIXED — Face++'s own docs show acne/mole/skin_spot as NUMERIC 0/1
  // ("value": 0), while dark_circle/blackhead/pores use STRING "0"/"1".
  // A strict === "1" check silently fails on the numeric fields. This
  // helper normalizes both shapes so nothing gets missed.
  const isFlagged = (field: { value?: string | number; confidence?: number } | undefined) => {
    if (!field) return false;
    const level = typeof field.value === "number" ? field.value : parseInt(field.value ?? "0", 10);
    return level === 1 && (field.confidence ?? 0) > CONFIDENCE_THRESHOLD;
  };

  if (isFlagged(result.acne)) {
    primaryConcerns.push("Acne");
  }

  if (isFlagged(result.dark_circle)) {
    primaryConcerns.push("Dark Circles");
  }

  // ADDED — this field was missing entirely. skin_spot is Face++'s actual
  // pigmentation/spot detector, distinct from dark_circle (under-eye shadow).
  // Without this, hyperpigmentation could never be reported at all.
  if (isFlagged(result.skin_spot)) {
    primaryConcerns.push("Dark Spots", "Hyperpigmentation");
  }

  if (isFlagged(result.blackhead)) {
    primaryConcerns.push("Blackheads");
  }

  // Pores span 4 face regions — flag the concern if any region hits.
  const poreRegions = ["pores_forehead", "pores_left_cheek", "pores_right_cheek", "pores_jaw"];
  const hasEnlargedPores = poreRegions.some((region) => isFlagged(result[region]));

  if (hasEnlargedPores) {
    primaryConcerns.push("Enlarged Pores");
  }

  // ⚠️ GAP (unchanged from before): Face++ does not return redness or
  // hydration/dryness signals at all. If your product needs "Redness" or
  // "Dryness"/"Dehydration" tags, those must come from your own v3 heuristic
  // run on the same image — merge that result in here before returning.

  return {
    skinType: skinType,
    primaryConcerns: [...new Set(primaryConcerns)],
    rawDetails: result,
  };
}