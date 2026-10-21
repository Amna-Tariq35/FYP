import { z } from "zod";

/** Skin types the questionnaire and photo engines are allowed to store. */
export const SKIN_TYPES = [
  "Oily",
  "Dry",
  "Combination",
  "Normal",
  "Sensitive",
  "Dehydrated",
  "Acne-Prone",
] as const;

export type SkinType = (typeof SKIN_TYPES)[number];

/**
 * Concerns a user can name, plus photo-only signals that still have a
 * product-tag mapping. Category words ("Cleanser", "vegan") are not concerns.
 */
export const CANONICAL_CONCERNS = [
  "acne",
  "oiliness",
  "dryness",
  "dehydration",
  "redness",
  "rosacea",
  "irritation",
  "damaged barrier",
  "dullness",
  "dark spots",
  "sun-damage",
  "anti-aging",
  "uneven texture",
] as const;

export type CanonicalConcern = (typeof CANONICAL_CONCERNS)[number];

export const CONCERN_LABELS: Record<CanonicalConcern, string> = {
  acne: "Acne & Breakouts",
  oiliness: "Oiliness",
  dryness: "Dryness",
  dehydration: "Dehydration",
  redness: "Redness",
  rosacea: "Rosacea",
  irritation: "Sensitivity / Irritation",
  "damaged barrier": "Damaged Barrier",
  dullness: "Dullness",
  "dark spots": "Dark Spots & Pigmentation",
  "sun-damage": "Sun Damage",
  "anti-aging": "Wrinkles & Fine Lines",
  "uneven texture": "Uneven Texture",
};

/** Product-catalog tags that should raise the score for each concern. */
export const CONCERN_TAG_MAP: Record<CanonicalConcern, string[]> = {
  acne: ["acne", "Acne Prone", "non_comedogenic", "sebum-control", "oil-free", "Exfoliating / Texture"],
  oiliness: ["oiliness", "sebum-control", "oil-free", "matte finish", "lightweight", "water-based"],
  dryness: ["dryness", "hydration", "Hydrating", "plumping", "lightweight-hydration", "water-based"],
  dehydration: ["dehydration", "hydration", "Hydrating", "lightweight-hydration", "water-based", "plumping"],
  redness: ["redness", "Redness & Soothing", "soothing", "calming", "rosacea", "irritation"],
  rosacea: ["rosacea", "redness", "Redness & Soothing", "soothing", "calming", "sensitive_friendly"],
  irritation: ["irritation", "sensitive_friendly", "soothing", "calming", "fragrance_free"],
  "damaged barrier": ["damaged barrier", "barrier-support", "soothing", "calming"],
  dullness: ["dullness", "glow", "brightening", "Dark Spots & Brightening"],
  "dark spots": ["dark spots", "Dark Spots & Brightening", "brightening", "hyperpigmentation", "sun-damage"],
  "sun-damage": ["sun-damage", "brightening", "Dark Spots & Brightening", "antioxidant"],
  "anti-aging": ["Anti-Aging", "anti-aging", "plumping", "barrier-support"],
  "uneven texture": ["Exfoliating / Texture", "exfoliating", "pore-blurring"],
};

const CONCERN_ALIASES: Record<string, CanonicalConcern> = {
  acne: "acne",
  "acne prone": "acne",
  "acne-prone": "acne",
  oiliness: "oiliness",
  "sebum-control": "oiliness",
  dryness: "dryness",
  hydration: "dryness",
  hydrating: "dryness",
  dehydration: "dehydration",
  "lightweight-hydration": "dehydration",
  redness: "redness",
  "redness & soothing": "redness",
  irritation: "irritation",
  sensitivity: "irritation",
  rosacea: "rosacea",
  "damaged barrier": "damaged barrier",
  "damaged_barrier": "damaged barrier",
  dullness: "dullness",
  glow: "dullness",
  "dark spots": "dark spots",
  dark_spots: "dark spots",
  hyperpigmentation: "dark spots",
  "dark spots & brightening": "dark spots",
  "sun-damage": "sun-damage",
  "sun damage": "sun-damage",
  "anti-aging": "anti-aging",
  "anti aging": "anti-aging",
  aging: "anti-aging",
  plumping: "anti-aging",
  "exfoliating / texture": "uneven texture",
  "uneven texture": "uneven texture",
  "enlarged pores": "uneven texture",
  blackheads: "uneven texture",
};

export function canonicalConcern(raw: unknown): CanonicalConcern | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return CONCERN_ALIASES[key] ?? null;
}

export const ALLERGY_OPTIONS = [
  { id: "fragrance", label: "Fragrance", keywords: ["fragrance", "parfum", "linalool", "limonene"] },
  { id: "alcohol", label: "Drying alcohol", keywords: ["alcohol denat", "sd alcohol", "isopropyl alcohol"] },
  { id: "essential-oils", label: "Essential oils", keywords: ["essential oil", "tea tree", "lavender oil", "peppermint oil"] },
  { id: "retinoid", label: "Retinoids", keywords: ["retinol", "retinal", "retinoid", "tretinoin", "adapalene"] },
  { id: "aha-bha", label: "Acids (AHA/BHA)", keywords: ["glycolic", "lactic acid", "salicylic", "mandelic"] },
] as const;

export type AllergyId = (typeof ALLERGY_OPTIONS)[number]["id"];

export const AnalysisConcernSchema = z.object({
  tag: z.enum(CANONICAL_CONCERNS),
  severity: z.number().min(0).max(1),
  source: z.enum(["questionnaire", "facepp", "gemini", "heuristic", "confirmation"]),
});

export const HeuristicsSchema = z.object({
  overallScore: z.number().optional(),
  metrics: z.record(z.string(), z.number()).optional(),
  regionBreakdown: z.record(z.string(), z.unknown()).optional(),
});

/** Stored inside skin_analysis_logs.concern_scores. Old rows are normalized in. */
export const ConcernScoresV2Schema = z.object({
  version: z.literal(2),
  main_concerns: z.array(z.string()),
  concerns: z.array(AnalysisConcernSchema),
  severity_scores: z.record(z.string(), z.number()),
  engine: z.enum(["questionnaire", "facepp", "gemini", "none"]),
  confidence: z.enum(["high", "medium", "low"]),
  heuristics: HeuristicsSchema.nullable().optional(),
  allergies: z.array(z.string()).optional(),
  pregnant: z.boolean().optional(),
});

export type ConcernScoresV2 = z.infer<typeof ConcernScoresV2Schema>;
export type AnalysisConcern = z.infer<typeof AnalysisConcernSchema>;

export function clampSeverity(value: unknown, fallback = 0.6): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 10) return Math.min(1, Math.max(0.1, n / 10));
  return Math.min(1, Math.max(0, n));
}

export function concernScoreMap(record: Pick<ConcernScoresV2, "concerns">): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of record.concerns) {
    map[item.tag] = Math.max(map[item.tag] ?? 0, item.severity);
  }
  return map;
}

function pushConcern(
  list: AnalysisConcern[],
  tag: CanonicalConcern,
  severity: number,
  source: AnalysisConcern["source"],
) {
  const existing = list.find((c) => c.tag === tag);
  if (!existing) {
    list.push({ tag, severity, source });
    return;
  }
  if (severity > existing.severity) existing.severity = severity;
}

/**
 * Turns whatever older clients stored into the v2 shape the scorer expects.
 * Questionnaire used to save the whole object as the score map; photo used
 * a different set of keys. Both still load.
 */
export function normalizeConcernScores(
  raw: unknown,
  method: string | null | undefined,
): ConcernScoresV2 {
  const source: AnalysisConcern["source"] =
    method === "questionnaire" ? "questionnaire" : "heuristic";

  if (raw && typeof raw === "object" && (raw as { version?: number }).version === 2) {
    const parsed = ConcernScoresV2Schema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }

  const concerns: AnalysisConcern[] = [];
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const named = obj.main_concerns ?? obj.concerns_list;
  if (Array.isArray(named)) {
    for (const item of named) {
      const tag = canonicalConcern(item);
      if (tag) pushConcern(concerns, tag, 0.7, source);
    }
  }

  const severityBag = obj.severity_scores;
  if (severityBag && typeof severityBag === "object" && !Array.isArray(severityBag)) {
    for (const [key, value] of Object.entries(severityBag as Record<string, unknown>)) {
      const tag = canonicalConcern(key);
      if (!tag) continue;
      pushConcern(concerns, tag, clampSeverity(value, 0.5), "questionnaire");
    }
  }

  if (concerns.length === 0) {
    for (const [key, value] of Object.entries(obj)) {
      if (["main_concerns", "concerns_list", "severity_scores", "heuristics", "scores"].includes(key)) {
        continue;
      }
      const tag = canonicalConcern(key);
      const severity = clampSeverity(value, -1);
      if (tag && severity > 0) pushConcern(concerns, tag, severity, source);
    }
  }

  const heuristicsRaw = obj.heuristics;
  let heuristics: ConcernScoresV2["heuristics"] = null;
  if (heuristicsRaw && typeof heuristicsRaw === "object") {
    const h = heuristicsRaw as Record<string, unknown>;
    heuristics = {
      overallScore: typeof h.overallScore === "number" ? h.overallScore : undefined,
      metrics:
        h.metrics && typeof h.metrics === "object"
          ? (h.metrics as Record<string, number>)
          : undefined,
      regionBreakdown:
        h.regionBreakdown && typeof h.regionBreakdown === "object"
          ? (h.regionBreakdown as Record<string, unknown>)
          : undefined,
    };
  }

  return {
    version: 2,
    main_concerns: concerns.map((c) => c.tag),
    concerns,
    severity_scores: concernScoreMap({ concerns }),
    engine:
      method === "questionnaire"
        ? "questionnaire"
        : method === "photo"
          ? "facepp"
          : "none",
    confidence: concerns.length > 0 ? "medium" : "low",
    heuristics,
    allergies: Array.isArray(obj.allergies) ? obj.allergies.filter((a) => typeof a === "string") : [],
    pregnant: obj.pregnant === true,
  };
}

export function isSkinType(value: unknown): value is SkinType {
  return typeof value === "string" && (SKIN_TYPES as readonly string[]).includes(value);
}

export const QuestionnaireInputSchema = z.object({
  method: z.literal("questionnaire"),
  skinType: z.enum(SKIN_TYPES),
  mainConcerns: z.array(z.enum(CANONICAL_CONCERNS)).max(5),
  concernScores: z.record(z.string(), z.number().min(0).max(1)).optional(),
  allergies: z.array(z.string()).max(8).optional(),
  pregnant: z.boolean().optional(),
});

export const MAX_IMAGE_BASE64_CHARS = 6_000_000;
