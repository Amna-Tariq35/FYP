/**
 * Turns skin patches sampled on a device into a single measured skin colour,
 * plus an honest statement of how much that measurement can be trusted.
 *
 * Why the device sends patch statistics rather than a photo: a phone JPEG
 * base64-encodes to roughly 3–7 MB, which is over the serverless request-body
 * limit, and decoding JPEG on the server would need a dependency this project
 * does not have. More importantly the device has the face landmarks — ML Kit
 * contours locate the cheeks far more precisely than anything a server could do
 * with a bounding box. So sampling happens where the pixels and the landmarks
 * already are, and only ~40 numbers cross the network. Nobody's face is uploaded.
 *
 * Pure functions. No I/O.
 */

import {
  type Lab,
  type Rgb,
  type Undertone,
  type DepthLevel,
  chroma,
  deltaE2000,
  depthFromIta,
  hueAngle,
  itaDegrees,
  monkToneFor,
  rgbToHex,
  rgbToLab,
} from "./color";
import { classifyUndertone } from "./match";

// ─────────────────────────────────────────────────────────────────────────────
// The neutral-skin reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hue angle and chroma that a *typical* complexion has at a given L*.
 *
 * Undertone only means anything relative to something, and this is that
 * something: a complexion is warm or cool relative to what is usual at its own
 * depth, not relative to a fixed hue. A single global threshold cannot work,
 * because skin hue rotates as skin deepens — "above 55° is warm" would label
 * almost every deep complexion cool, which is both wrong and precisely the
 * failure that makes shade finders feel broken for darker skin.
 *
 * The two anchors are central values for facial skin from the colorimetric skin
 * literature (Chardon et al. 1991; Xiao et al., *Color Research & Application*
 * 2017): around L* 70 skin sits near a* 11, b* 17 (hue 57°), and around L* 35
 * near a* 13, b* 15 (hue 49°). Hue is interpolated linearly between them and
 * held flat outside; chroma is near-constant across the range, so it is a
 * constant here rather than fake precision.
 *
 * **These two anchors are a calibration parameter, not a law of nature.** They
 * decide only how the *word* warm/cool/neutral/olive is assigned. The depth axis
 * — ITA°, `depth_level`, and the ΔE2000 ranking that actually picks the shade —
 * does not depend on them at all, so a recalibration cannot move the recommended
 * shade, only the adjective printed beside it.
 *
 * Deliberately **not** fitted over {@link MONK_SWATCHES}, which was the obvious
 * thing to try. Measured, those ten swatches have a* between 0.2 and 12.3, with
 * swatches 3 and 4 sitting at a* ≈ 0.3 and hue ≈ 89° — essentially pure yellow.
 * Real skin is never that: haemoglobin puts a floor under a* that no complexion
 * goes below. The Monk scale is an illustrative palette for self-identification,
 * and it is excellent at what it is for — binning depth, which is what
 * {@link monkToneFor} still uses it for — but it is not a colorimetric sample of
 * faces. A hue reference fitted over it lands near 76° at light depths, so every
 * light-skinned user would come out ~18° below reference and be reported cool.
 */
export function skinReference(L: number): { hue: number; chroma: number } {
  const LIGHT = { L: 70, hue: 57.1 };
  const DEEP = { L: 35, hue: 49.1 };

  const t = (L - DEEP.L) / (LIGHT.L - DEEP.L);
  const clamped = Math.min(1, Math.max(0, t));
  return {
    hue: DEEP.hue + clamped * (LIGHT.hue - DEEP.hue),
    chroma: 20,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire format
// ─────────────────────────────────────────────────────────────────────────────

/** The five regions the device samples, per the feature spec. */
export const SKIN_REGIONS = [
  "forehead",
  "left_cheek",
  "right_cheek",
  "jaw",
  "nose_bridge",
] as const;

export type SkinRegion = (typeof SKIN_REGIONS)[number];

/** Region names as they appear in messages shown to the user. */
export const REGION_LABELS: Record<SkinRegion, string> = {
  forehead: "forehead",
  left_cheek: "left cheek",
  right_cheek: "right cheek",
  jaw: "jawline",
  nose_bridge: "bridge of the nose",
};

/**
 * One sampled patch. `r`/`g`/`b` are the *median* of the pixels the device
 * accepted after discarding specular highlights and shadows — median rather than
 * mean because a single blown-out pixel drags a mean and cannot move a median.
 */
export type SkinPatch = {
  region: SkinRegion;
  r: number;
  g: number;
  b: number;
  /** Pixels that survived rejection. A tiny count means the patch missed skin. */
  pixels: number;
  /** Luminance spread within the patch, 0–100 in L* units. */
  luminanceStdDev: number;
};

/**
 * Scene illuminant estimate for white balance.
 *
 * The device computes it as a Minkowski p-norm over the whole frame with p = 6
 * (the "shades of grey" estimator, Finlayson & Trezzi 2004). p = 1 is plain
 * gray-world, which a large block of one colour — a red jumper, a warm wall —
 * biases badly; p → ∞ is max-RGB, which a single blown highlight ruins. p = 6
 * sits between the two and is the value that paper recommends.
 */
export type Illuminant = { r: number; g: number; b: number };

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

export type QualityVerdict = {
  ok: boolean;
  /** Why a retake is needed. Null when `ok`. */
  retakeReason: string | null;
  /** Short imperative fix shown under the reason, e.g. "Face a window". */
  retakeHint: string | null;
  /** Non-fatal observations. Present even when `ok` is true. */
  warnings: string[];
};

export type ConfidenceReport = {
  /** 0–1. */
  score: number;
  label: "high" | "moderate" | "low";
  /** Each contributing factor, so a low score is explainable rather than opaque. */
  factors: { name: string; value: number; note: string }[];
};

export type SkinMeasurement = {
  hex: string;
  rgb: Rgb;
  lab: Lab;
  /** Individual Typology Angle, degrees. */
  ita: number;
  depthLevel: DepthLevel;
  undertone: Undertone;
  monkScale: number;
  /** Hue offset from the neutral reference at this lightness, degrees. */
  hueDeviation: number;
  /** Measured chroma over the reference chroma at this lightness. */
  chromaRatio: number;
  /** Channel gains applied by white balance, for auditing. */
  whiteBalanceGains: { r: number; g: number; b: number };
  /** Regions that contributed to the final colour. */
  regionsUsed: SkinRegion[];
};

export type AnalysisResult = {
  quality: QualityVerdict;
  confidence: ConfidenceReport;
  /** Null only when `quality.ok` is false and no colour could be established. */
  skin: SkinMeasurement | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Fewer accepted pixels than this and a patch is noise, not a measurement. */
const MIN_PATCH_PIXELS = 40;

/** Regions needed before a reading is offered at all. */
const MIN_USABLE_PATCHES = 3;

/**
 * L* below which no complexion could plausibly have been photographed — the
 * frame is essentially black.
 *
 * Set far lower than it first looks like it should be, and deliberately so. The
 * darkest swatch on the Monk scale measures **L\* 14.6**, so any floor near 18
 * — which is where an "obviously too dark" threshold naturally lands — rejects
 * the deepest real complexions and tells those users to retake a photo that was
 * fine. Underexposure is a property of the *frame*, not of the person, so it is
 * detected from the illuminant instead (see {@link MIN_ILLUMINANT_LIGHTNESS}),
 * and this floor only catches a genuinely black image.
 */
const MIN_SKIN_LIGHTNESS = 6;

/**
 * L* of the scene illuminant below which the photo is underexposed.
 *
 * The illuminant is a p = 6 Minkowski norm, so it tracks the brighter part of
 * the frame. In a properly exposed photo that lands high whatever the subject's
 * complexion; when it is dim, the whole frame is dim and no amount of correction
 * recovers the colour. This is the check that distinguishes "the room was dark"
 * from "this person has deep skin" — a distinction a skin-lightness threshold
 * cannot make.
 */
const MIN_ILLUMINANT_LIGHTNESS = 45;

/** L* above which the frame is blown out and colour is gone. */
const MAX_SKIN_LIGHTNESS = 96;

/**
 * Ratio of the largest to smallest white-balance gain above which the light was
 * so strongly coloured that correcting it is guesswork.
 *
 * This is the gate the spec singled out — "skipping this step is exactly what
 * makes these features feel broken". Warm indoor bulbs, phone torches and
 * coloured LEDs all shift skin far more than the difference between two
 * neighbouring foundation shades, so an uncorrected reading is not a slightly
 * worse answer, it is a confidently wrong one.
 */
const MAX_ILLUMINANT_CAST = 1.75;

/** Illuminant cast above which the reading is still offered but flagged. */
const WARN_ILLUMINANT_CAST = 1.3;

/** Cross-patch ΔE above which the regions disagree too much to average. */
const MAX_PATCH_DISAGREEMENT = 12;

/** Cross-patch ΔE above which the reading is offered but flagged. */
const WARN_PATCH_DISAGREEMENT = 6;

/**
 * ΔE from the group's median colour beyond which a single patch is treated as an
 * outlier and dropped rather than counted as disagreement.
 *
 * Without this the disagreement check and the median aggregate fight each other:
 * the median already shrugs off one bad region, but a check that looks at the
 * *worst* pair sees that same region and demands a retake, so the robustness is
 * thrown away at the last step. A hair across one cheek should cost a region,
 * not the whole reading.
 */
const PATCH_OUTLIER_DELTA_E = 8;

/** Within-patch L* spread above which a patch is textured, shadowed or hairy. */
const MAX_PATCH_STDDEV = 14;

// ─────────────────────────────────────────────────────────────────────────────
// White balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Von Kries channel scaling: divide each channel by the illuminant's estimate of
 * itself so the illuminant becomes neutral grey, preserving overall brightness.
 *
 * Gains are clamped. An unclamped gain from a near-zero channel — a photo under a
 * pure red light, say — produces absurd corrections that look like a valid answer.
 * Clamping keeps the numbers sane, and {@link assessQuality} independently
 * refuses the reading when the raw cast was that extreme, so the clamp never
 * silently rescues a photo that should have been retaken.
 */
export function whiteBalanceGains(illuminant: Illuminant): {
  gains: { r: number; g: number; b: number };
  cast: number;
} {
  const { r, g, b } = illuminant;
  const safe = (v: number) => Math.max(1, v);
  const grey = (safe(r) + safe(g) + safe(b)) / 3;

  const raw = {
    r: grey / safe(r),
    g: grey / safe(g),
    b: grey / safe(b),
  };

  // How far from neutral the light was, before any clamping.
  const values = [raw.r, raw.g, raw.b];
  const cast = Math.max(...values) / Math.max(1e-6, Math.min(...values));

  const clamp = (v: number) => Math.min(2.5, Math.max(0.4, v));
  return { gains: { r: clamp(raw.r), g: clamp(raw.g), b: clamp(raw.b) }, cast };
}

function applyGains(rgb: Rgb, gains: { r: number; g: number; b: number }): Rgb {
  return {
    r: Math.min(255, Math.max(0, rgb.r * gains.r)),
    g: Math.min(255, Math.max(0, rgb.g * gains.g)),
    b: Math.min(255, Math.max(0, rgb.b * gains.b)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Robust aggregation
// ─────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Combines patches by taking the median of each channel across regions.
 *
 * Median again, not mean: one patch landing on a shadow, a stray hair, or the
 * edge of blush should not move the answer, and with five regions the median
 * tolerates one bad patch outright. Averaging would let a single bad region drag
 * the result by more than the gap between two foundation shades.
 */
function aggregatePatches(patches: SkinPatch[]): Rgb {
  return {
    r: median(patches.map((p) => p.r)),
    g: median(patches.map((p) => p.g)),
    b: median(patches.map((p) => p.b)),
  };
}

/**
 * Takes the median colour, discards regions that disagree with it beyond
 * {@link PATCH_OUTLIER_DELTA_E}, then re-medians the survivors.
 *
 * One pass, not iterated to convergence: with at most five regions a second pass
 * can only ever remove a patch that the first pass already judged acceptable,
 * which would start eroding real variation instead of removing outliers.
 *
 * The residual limitation, stated rather than hidden: if a *majority* of regions
 * are wrong in the same direction the median follows them and the good regions
 * get discarded instead. No median can do better than that. Uneven lighting is
 * the realistic way for that to happen, and the disagreement gate catches it
 * because the majority still will not agree closely among themselves.
 */
function rejectOutliers(patches: SkinPatch[]): {
  kept: SkinPatch[];
  dropped: SkinPatch[];
  colour: Rgb;
  /** Worst ΔE from the final colour among the kept patches. */
  disagreement: number;
} {
  const provisional = aggregatePatches(patches);
  const provisionalLab = rgbToLab(provisional);

  const kept: SkinPatch[] = [];
  const dropped: SkinPatch[] = [];
  for (const p of patches) {
    const d = deltaE2000(rgbToLab({ r: p.r, g: p.g, b: p.b }), provisionalLab);
    (d > PATCH_OUTLIER_DELTA_E ? dropped : kept).push(p);
  }

  // Never drop so many that the reading rests on fewer regions than the minimum.
  // If that many are outliers the problem is the photo, and letting them through
  // lets the disagreement gate say so properly.
  if (kept.length < MIN_USABLE_PATCHES) {
    return {
      kept: patches,
      dropped: [],
      colour: provisional,
      disagreement: worstDeviation(patches, provisionalLab),
    };
  }

  const colour = aggregatePatches(kept);
  return {
    kept,
    dropped,
    colour,
    disagreement: worstDeviation(kept, rgbToLab(colour)),
  };
}

/** Worst ΔE2000 between any patch and a given colour. */
function worstDeviation(patches: SkinPatch[], lab: Lab): number {
  let worst = 0;
  for (const p of patches) {
    const d = deltaE2000(rgbToLab({ r: p.r, g: p.g, b: p.b }), lab);
    if (d > worst) worst = d;
  }
  return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Measures skin colour from device patches.
 *
 * @param patches   Patch medians from the device, one per sampled region.
 * @param illuminant Scene illuminant estimate, or null to skip white balance.
 * @param reference  Neutral hue/chroma expected at a given L*. Defaults to
 *                   {@link skinReference}; override only in tests.
 */
export function analyseSkin(
  patches: SkinPatch[],
  illuminant: Illuminant | null,
  reference: (L: number) => { hue: number; chroma: number } = skinReference
): AnalysisResult {
  const warnings: string[] = [];

  // ── Drop patches that never found skin ───────────────────────────────────
  const usable = patches.filter((p) => {
    if (p.pixels < MIN_PATCH_PIXELS) return false;
    if (p.luminanceStdDev > MAX_PATCH_STDDEV) return false;
    return Number.isFinite(p.r) && Number.isFinite(p.g) && Number.isFinite(p.b);
  });

  const droppedForTexture = patches.filter(
    (p) => p.pixels >= MIN_PATCH_PIXELS && p.luminanceStdDev > MAX_PATCH_STDDEV
  ).length;
  if (droppedForTexture > 0) {
    warnings.push(
      `${droppedForTexture} ${droppedForTexture === 1 ? "region was" : "regions were"} ` +
        `too uneven to measure — usually hair, a shadow edge, or makeup already on.`
    );
  }

  if (usable.length < MIN_USABLE_PATCHES) {
    return {
      quality: {
        ok: false,
        retakeReason:
          `Only ${usable.length} of ${SKIN_REGIONS.length} skin areas could be read.`,
        retakeHint:
          "Hold the phone straight on, fill the frame with your face, and keep hair off your forehead and cheeks.",
        warnings,
      },
      confidence: {
        score: 0,
        label: "low",
        factors: [
          { name: "Skin areas read", value: usable.length, note: "Need at least 3." },
        ],
      },
      skin: null,
    };
  }

  // ── White balance ────────────────────────────────────────────────────────
  const wb = illuminant
    ? whiteBalanceGains(illuminant)
    : { gains: { r: 1, g: 1, b: 1 }, cast: 1 };

  if (!illuminant) {
    warnings.push(
      "No lighting reference was sent, so the colour is taken as-is. Results are less reliable under coloured light."
    );
  }

  const balanced = usable.map<SkinPatch>((p) => {
    const c = applyGains({ r: p.r, g: p.g, b: p.b }, wb.gains);
    return { ...p, r: c.r, g: c.g, b: c.b };
  });

  // ── Discard regions that disagree with the rest, then measure ────────────
  const robust = rejectOutliers(balanced);
  if (robust.dropped.length > 0) {
    warnings.push(
      `${robust.dropped.length === 1 ? "One region" : `${robust.dropped.length} regions`} ` +
        `(${robust.dropped.map((p) => REGION_LABELS[p.region]).join(", ")}) ` +
        `read very differently from the rest and ${robust.dropped.length === 1 ? "was" : "were"} left out.`
    );
  }

  const skinRgb = robust.colour;
  const skinLab = rgbToLab(skinRgb);
  const disagreement = robust.disagreement;

  const quality = assessQuality({
    lab: skinLab,
    cast: wb.cast,
    disagreement,
    illuminantLightness: illuminant
      ? rgbToLab({ r: illuminant.r, g: illuminant.g, b: illuminant.b }).L
      : null,
    warnings,
  });

  if (!quality.ok) {
    return {
      quality,
      confidence: { score: 0, label: "low", factors: [] },
      skin: null,
    };
  }

  // ── Classify ─────────────────────────────────────────────────────────────
  const ita = itaDegrees(skinLab);
  const ref = reference(skinLab.L);
  const tone = classifyUndertone(skinLab, ref);

  const skin: SkinMeasurement = {
    hex: rgbToHex(skinRgb),
    rgb: {
      r: Math.round(skinRgb.r),
      g: Math.round(skinRgb.g),
      b: Math.round(skinRgb.b),
    },
    lab: {
      L: Number(skinLab.L.toFixed(2)),
      a: Number(skinLab.a.toFixed(2)),
      b: Number(skinLab.b.toFixed(2)),
    },
    ita: Number(ita.toFixed(1)),
    depthLevel: depthFromIta(ita),
    undertone: tone.undertone,
    monkScale: monkToneFor(skinLab),
    hueDeviation: Number(tone.hueDeviation.toFixed(1)),
    chromaRatio: Number(tone.chromaRatio.toFixed(2)),
    whiteBalanceGains: {
      r: Number(wb.gains.r.toFixed(3)),
      g: Number(wb.gains.g.toFixed(3)),
      b: Number(wb.gains.b.toFixed(3)),
    },
    regionsUsed: robust.kept.map((p) => p.region),
  };

  return {
    quality,
    confidence: scoreConfidence({
      patchCount: robust.kept.length,
      disagreement,
      cast: wb.cast,
      meanStdDev:
        robust.kept.reduce((t, p) => t + p.luminanceStdDev, 0) / robust.kept.length,
      hadIlluminant: illuminant !== null,
    }),
    skin,
  };
}

/**
 * Measures from a single already-corrected colour.
 *
 * The escape hatch for callers that have a skin hex but no patches — a saved
 * beauty-profile value, or a browser client that sampled in canvas. Confidence
 * is capped low and says why: without patches there is no way to check that the
 * regions agreed, and without an illuminant there is no way to know the light
 * was neutral.
 */
export function analyseSkinHex(
  rgb: Rgb,
  reference: (L: number) => { hue: number; chroma: number } = skinReference
): AnalysisResult {
  const lab = rgbToLab(rgb);
  const quality = assessQuality({
    lab,
    cast: 1,
    disagreement: 0,
    // A supplied colour carries no scene information, so the underexposure check
    // cannot run. The low confidence cap below is what accounts for that.
    illuminantLightness: null,
    warnings: [],
  });

  if (!quality.ok) {
    return { quality, confidence: { score: 0, label: "low", factors: [] }, skin: null };
  }

  const ita = itaDegrees(lab);
  const tone = classifyUndertone(lab, reference(lab.L));

  return {
    quality,
    confidence: {
      score: 0.45,
      label: "moderate",
      factors: [
        {
          name: "Single colour input",
          value: 0.45,
          note: "Supplied as one colour, so region agreement and lighting could not be checked.",
        },
      ],
    },
    skin: {
      hex: rgbToHex(rgb),
      rgb: { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) },
      lab: {
        L: Number(lab.L.toFixed(2)),
        a: Number(lab.a.toFixed(2)),
        b: Number(lab.b.toFixed(2)),
      },
      ita: Number(ita.toFixed(1)),
      depthLevel: depthFromIta(ita),
      undertone: tone.undertone,
      monkScale: monkToneFor(lab),
      hueDeviation: Number(tone.hueDeviation.toFixed(1)),
      chromaRatio: Number(tone.chromaRatio.toFixed(2)),
      whiteBalanceGains: { r: 1, g: 1, b: 1 },
      regionsUsed: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates and confidence
// ─────────────────────────────────────────────────────────────────────────────

function assessQuality(input: {
  lab: Lab;
  cast: number;
  disagreement: number;
  /** L* of the scene illuminant, or null when the device did not send one. */
  illuminantLightness: number | null;
  warnings: string[];
}): QualityVerdict {
  const warnings = [...input.warnings];

  // Underexposure is checked on the *light*, not on the skin. A dark frame and a
  // deep complexion look identical if you only look at skin lightness, and
  // conflating them is what makes these features unusable for darker users.
  if (
    input.illuminantLightness !== null &&
    input.illuminantLightness < MIN_ILLUMINANT_LIGHTNESS
  ) {
    return {
      ok: false,
      retakeReason: "There wasn't enough light in this photo to read colour accurately.",
      retakeHint:
        "Face a window or turn a light on, and keep it in front of you rather than behind.",
      warnings,
    };
  }

  if (input.lab.L < MIN_SKIN_LIGHTNESS) {
    return {
      ok: false,
      retakeReason: "The skin areas in this photo came out almost black.",
      retakeHint: "Move somewhere brighter and make sure your face is lit from the front.",
      warnings,
    };
  }

  if (input.lab.L > MAX_SKIN_LIGHTNESS) {
    return {
      ok: false,
      retakeReason: "The photo is overexposed — the bright areas have lost their colour.",
      retakeHint: "Move out of direct sun or harsh light, or step back from the lamp.",
      warnings,
    };
  }

  if (input.cast > MAX_ILLUMINANT_CAST) {
    return {
      ok: false,
      retakeReason: "The light in this photo is strongly coloured, which shifts skin more than a whole shade.",
      retakeHint: "Try daylight, or plain white indoor light. Avoid warm bulbs, coloured LEDs and phone torches.",
      warnings,
    };
  }

  if (input.disagreement > MAX_PATCH_DISAGREEMENT) {
    return {
      ok: false,
      retakeReason: "Different parts of your face measured very differently, so the lighting is uneven.",
      retakeHint: "Face the light straight on so both cheeks are lit the same, and take it with a bare face.",
      warnings,
    };
  }

  if (input.cast > WARN_ILLUMINANT_CAST) {
    warnings.push(
      "The light was a little warm or cool. It has been corrected for, but daylight gives a better reading."
    );
  }

  if (input.disagreement > WARN_PATCH_DISAGREEMENT) {
    warnings.push(
      `Your face measured up to ΔE ${input.disagreement.toFixed(
        1
      )} differently across regions, which usually means one side is lit more than the other.`
    );
  }

  return { ok: true, retakeReason: null, retakeHint: null, warnings };
}

/**
 * Combines the four things that make a reading trustworthy into one 0–1 score.
 *
 * Multiplicative rather than an average, because these are not independent votes
 * — they are all requirements. A photo with five perfect patches under a strong
 * orange light is not "mostly fine"; the light alone invalidates it, and an
 * average would hide that behind three good factors.
 */
function scoreConfidence(input: {
  patchCount: number;
  disagreement: number;
  cast: number;
  meanStdDev: number;
  hadIlluminant: boolean;
}): ConfidenceReport {
  const coverage = Math.min(1, input.patchCount / SKIN_REGIONS.length);
  const agreement = Math.max(
    0,
    1 - input.disagreement / MAX_PATCH_DISAGREEMENT
  );
  const neutrality = Math.max(
    0,
    1 - (input.cast - 1) / (MAX_ILLUMINANT_CAST - 1)
  );
  const evenness = Math.max(0, 1 - input.meanStdDev / MAX_PATCH_STDDEV);

  let score = coverage * agreement * neutrality * evenness;
  // Without a lighting reference the colour is uncorrected, so cap the claim.
  if (!input.hadIlluminant) score = Math.min(score, 0.5);

  return {
    score: Number(score.toFixed(2)),
    label: score >= 0.7 ? "high" : score >= 0.4 ? "moderate" : "low",
    factors: [
      {
        name: "Face coverage",
        value: Number(coverage.toFixed(2)),
        note: `${input.patchCount} of ${SKIN_REGIONS.length} skin areas read.`,
      },
      {
        name: "Region agreement",
        value: Number(agreement.toFixed(2)),
        note: `Regions differed by up to ΔE ${input.disagreement.toFixed(1)}.`,
      },
      {
        name: "Light neutrality",
        value: Number(neutrality.toFixed(2)),
        note: input.hadIlluminant
          ? `Illuminant cast ${input.cast.toFixed(2)}× from neutral.`
          : "No lighting reference was available.",
      },
      {
        name: "Surface evenness",
        value: Number(evenness.toFixed(2)),
        note: `Average within-region spread ${input.meanStdDev.toFixed(1)} L*.`,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation of untrusted input
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates a patch array off the wire.
 *
 * Written by hand rather than with zod to match how the other route handlers in
 * this project validate, and returns a reason string so a malformed client gets
 * a message it can act on instead of a bare 400.
 */
export function parsePatches(
  input: unknown
): { patches: SkinPatch[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "patches must be an array." };
  if (input.length === 0) return { error: "patches must not be empty." };
  // Bounded so a malicious client cannot make the O(n²) disagreement check
  // expensive. Five regions are expected; ten is already generous.
  if (input.length > 10) return { error: "patches must contain at most 10 entries." };

  const patches: SkinPatch[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      return { error: "Each patch must be an object." };
    }
    const p = raw as Record<string, unknown>;

    const region = p.region;
    if (typeof region !== "string" || !SKIN_REGIONS.includes(region as SkinRegion)) {
      return { error: `Unknown patch region: ${String(region)}.` };
    }
    if (seen.has(region)) return { error: `Duplicate patch region: ${region}.` };
    seen.add(region);

    const channel = (name: "r" | "g" | "b"): number | null => {
      const v = p[name];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 255) return null;
      return v;
    };
    const r = channel("r");
    const g = channel("g");
    const b = channel("b");
    if (r === null || g === null || b === null) {
      return { error: `Patch ${region} must have numeric r/g/b in 0–255.` };
    }

    const pixels = p.pixels;
    if (typeof pixels !== "number" || !Number.isFinite(pixels) || pixels < 0) {
      return { error: `Patch ${region} must have a non-negative pixels count.` };
    }

    const sd = p.luminanceStdDev;
    if (typeof sd !== "number" || !Number.isFinite(sd) || sd < 0) {
      return { error: `Patch ${region} must have a non-negative luminanceStdDev.` };
    }

    patches.push({
      region: region as SkinRegion,
      r,
      g,
      b,
      pixels,
      luminanceStdDev: sd,
    });
  }

  return { patches };
}

/** Validates the illuminant estimate. Absent is allowed; malformed is not. */
export function parseIlluminant(
  input: unknown
): { illuminant: Illuminant | null } | { error: string } {
  if (input === undefined || input === null) return { illuminant: null };
  if (typeof input !== "object") return { error: "illuminant must be an object." };
  const o = input as Record<string, unknown>;

  const channel = (name: "r" | "g" | "b"): number | null => {
    const v = o[name];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 255) return null;
    return v;
  };
  const r = channel("r");
  const g = channel("g");
  const b = channel("b");
  if (r === null || g === null || b === null) {
    return { error: "illuminant must have numeric r/g/b in 0–255." };
  }
  // An all-black estimate carries no information and would produce gains of
  // exactly 1 through the safe() floor — reject it rather than pretend.
  if (r + g + b < 3) {
    return { error: "illuminant is black, which is not a usable lighting estimate." };
  }
  return { illuminant: { r, g, b } };
}

/** Re-exported so callers get the whole vocabulary from one module. */
export { chroma, hueAngle };
