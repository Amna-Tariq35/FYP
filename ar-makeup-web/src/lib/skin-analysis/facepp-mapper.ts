import {
  type AnalysisConcern,
  type CanonicalConcern,
  type SkinType,
} from "./contract";

type FlagField = { value?: string | number; confidence?: number } | undefined;

function isFlagged(field: FlagField, threshold = 0.5) {
  if (!field) return false;
  const level =
    typeof field.value === "number" ? field.value : parseInt(String(field.value ?? "0"), 10);
  return level === 1 && (field.confidence ?? 0) > threshold;
}

function add(
  concerns: AnalysisConcern[],
  tag: CanonicalConcern,
  severity: number,
) {
  const existing = concerns.find((c) => c.tag === tag);
  if (!existing) concerns.push({ tag, severity, source: "facepp" });
  else if (severity > existing.severity) existing.severity = severity;
}

export type FaceppMapResult = {
  skinType: SkinType;
  concerns: AnalysisConcern[];
  summary: string;
  needsSkinTypeConfirmation: boolean;
  confidence: "high" | "medium" | "low";
};

/**
 * Maps a Face++ skinanalyze `result` object onto our skin types and
 * canonical concerns. Redness still comes from the browser heuristic because
 * Face++ does not return it.
 */
export function mapFaceppSkinResult(
  result: Record<string, unknown> | null | undefined,
  cvRedness = 0,
): FaceppMapResult {
  if (!result) {
    return {
      skinType: "Normal",
      concerns: [],
      summary: "We could not read a clear skin signal from this photo.",
      needsSkinTypeConfirmation: true,
      confidence: "low",
    };
  }

  const skinTypeObj = result.skin_type as { skin_type?: number } | number | undefined;
  const skinTypeIndex =
    typeof skinTypeObj === "number" ? skinTypeObj : skinTypeObj?.skin_type;

  let skinType: SkinType = "Normal";
  if (skinTypeIndex === 0) skinType = "Oily";
  else if (skinTypeIndex === 1) skinType = "Dry";
  else if (skinTypeIndex === 3) skinType = "Combination";

  const concerns: AnalysisConcern[] = [];
  const labels: string[] = [];
  let strongSignals = 0;

  const wrinkleFields = [
    "forehead_wrinkle",
    "crows_feet",
    "eye_finelines",
    "glabella_wrinkle",
    "nasolabial_fold",
  ];
  const wrinkleCount = wrinkleFields.filter((field) =>
    isFlagged(result[field] as FlagField),
  ).length;
  if (wrinkleCount >= 2) {
    add(concerns, "anti-aging", Math.min(1, 0.45 + wrinkleCount * 0.1));
    labels.push("fine lines");
    strongSignals += 1;
  }

  if (isFlagged(result.dark_circle as FlagField)) {
    add(concerns, "dullness", 0.65);
    labels.push("dullness");
    strongSignals += 1;
  }

  if (isFlagged(result.skin_spot as FlagField)) {
    add(concerns, "dark spots", 0.75);
    labels.push("dark spots");
    strongSignals += 1;
  }

  const hasAcne = isFlagged(result.acne as FlagField);
  if (hasAcne) {
    add(concerns, "acne", 0.8);
    labels.push("acne");
    strongSignals += 1;
  }

  const poreRegions = [
    "pores_forehead",
    "pores_left_cheek",
    "pores_right_cheek",
    "pores_jaw",
  ];
  const hasPores = poreRegions.some((region) => isFlagged(result[region] as FlagField));
  const hasBlackhead = isFlagged(result.blackhead as FlagField);
  if (hasPores || hasBlackhead) {
    add(concerns, "uneven texture", 0.6);
    labels.push("uneven texture");
  }

  if (cvRedness > 58) {
    add(concerns, "redness", Math.min(1, cvRedness / 100));
    labels.push("redness");
    if (cvRedness > 65) strongSignals += 1;
  }
  if (cvRedness > 65) skinType = "Sensitive";
  else if (hasAcne && (hasPores || hasBlackhead)) {
    skinType = "Acne-Prone";
  }

  if (skinType === "Dry") {
    add(concerns, "dryness", 0.7);
    add(concerns, "dehydration", 0.55);
    labels.push("dryness");
  }
  if (skinType === "Oily") {
    add(concerns, "oiliness", 0.7);
  }

  const needsSkinTypeConfirmation = skinType === "Normal";
  const confidence: FaceppMapResult["confidence"] =
    strongSignals >= 2 ? "high" : strongSignals === 1 || !needsSkinTypeConfirmation ? "medium" : "low";

  const focus = labels.slice(0, 3).join(", ");
  const summary = focus
    ? `From your photo, your skin reads as ${skinType.toLowerCase()}. The clearest signals were ${focus}. This is a product-matching estimate, not a medical diagnosis.`
    : `From your photo, your skin reads as ${skinType.toLowerCase()} without a strong single concern. A short questionnaire can make the routine more precise.`;

  return { skinType, concerns, summary, needsSkinTypeConfirmation, confidence };
}
