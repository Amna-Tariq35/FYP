/**
 * Foundation shade ranking.
 *
 * Pure functions over already-measured colour: this module never touches the
 * network, Supabase, or a request object, so the ranking can be unit-tested and
 * reused from the browser as well as the API route.
 *
 * Depends only on {@link ./color} — the CIE maths lives there.
 */

import {
  type Lab,
  type Undertone,
  chroma,
  deltaE2000,
  describeDeltaE,
  hexToLab,
  hueAngle,
} from "./color";

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

/** A row of `product_shades`, narrowed to the columns ranking actually reads. */
export type ShadeRow = {
  product_key: string;
  shade_key: string;
  shade_name: string | null;
  shade_hex: string | null;
  shade_order: number | null;
  /**
   * The catalog's own undertone word. Used *only* as a tie-break — see
   * {@link rankFoundationShades} for why it is never trusted as a colour signal.
   */
  undertone: string | null;
  /**
   * Real product colour when `db/013_foundation_match_hex.sql` has been applied.
   * Ranking uses this. `shade_hex` is left alone because AR try-on keys off it.
   */
  match_hex?: string | null;
};

/** A row of `makeup_products`, narrowed the same way. */
export type ProductRow = {
  product_key: string;
  name: string | null;
  brand: string | null;
  price: number | null;
  image_url: string | null;
  finish: string | null;
  coverage: string | null;
  is_active: boolean | null;
};

export type RankOptions = {
  /** The user's measured skin colour in CIELAB. */
  skinLab: Lab;
  /** Measured undertone, for the reason strings and the tie-break. */
  undertone: Undertone;
  /** `finish_preference` from the beauty profile, if the user has set one. */
  finishPreference?: string | null;
  /** How many distinct colours to return. */
  limit?: number;
  /** When "low", reason strings say the nearby shades are a range. */
  confidenceLabel?: "high" | "moderate" | "low";
};

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

/** One of the other products that sells the identical colour. */
export type AlternateSource = {
  productKey: string;
  shadeKey: string;
  productName: string;
  brand: string | null;
  price: number | null;
  finish: string | null;
};

export type ShadeMatch = {
  rank: number;
  /** ΔE2000 between the measured skin and this shade. The headline number. */
  deltaE: number;
  /** Plain-English band for {@link deltaE}. */
  quality: string;
  /** The catalog AR colour (`shade_hex`). Try-on and saved looks use this. */
  shadeHex: string;
  /** Real measured swatch when `match_hex` is set and differs from `shadeHex`. */
  matchHex: string | null;
  shadeName: string;
  shadeKey: string;
  productKey: string;
  productName: string;
  brand: string | null;
  price: number | null;
  imageUrl: string | null;
  finish: string | null;
  coverage: string | null;
  /** The catalog's undertone word for this shade, surfaced but not trusted. */
  catalogUndertone: string | null;
  /** Lighter / deeper / level with the measured skin, by L*. */
  depthDirection: "lighter" | "deeper" | "level";
  /** Signed L* difference, shade minus skin. */
  deltaL: number;
  /** Why this shade is here, in words the user can check against the numbers. */
  reason: string;
  /** Other products selling this exact colour. Empty when the colour is unique. */
  alsoAvailableFrom: AlternateSource[];
};

/**
 * What the catalog can and cannot discriminate.
 *
 * This is reported out deliberately. A matcher that silently degrades is a
 * matcher nobody can debug, and in a viva "how do you know your undertone
 * matching works?" is answerable only if the answer is measured.
 */
export type PaletteDiagnostics = {
  /** Rows considered after dropping inactive products and unparseable hexes. */
  shadeRowsConsidered: number;
  /** Distinct colours those rows collapse to. */
  distinctColours: number;
  /** L* of the lightest and deepest colour, and the span between them. */
  lightnessRange: { min: number; max: number; span: number };
  /** Hue-angle span across the whole palette, in degrees. */
  hueSpanDegrees: number;
  /** Hue-angle span among colours near the user's depth. The number that matters. */
  localHueSpanDegrees: number;
  /** Colours within the depth window the local span was measured over. */
  localColourCount: number;
  /** 0 = the palette cannot discriminate undertone at all; 1 = fully. */
  undertoneWeight: number;
  /** Human-readable summary of the two lines above. */
  notes: string[];
};

export type RankResult = {
  matches: ShadeMatch[];
  /** Nearest colour lighter than the best match, if the palette has one. */
  lighterAlternate: ShadeMatch | null;
  /** Nearest colour deeper than the best match, if the palette has one. */
  deeperAlternate: ShadeMatch | null;
  diagnostics: PaletteDiagnostics;
  /**
   * Up to three shades: those within ~2.5 ΔE of the best, or the best plus the
   * nearest lighter and deeper chip when the winner sits between two colours.
   */
  shadeRange: ShadeMatch[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Largest undertone penalty, in ΔE-equivalent units, applied at a full 30° hue
 * error when the palette can support the judgement.
 *
 * Deliberately small. ΔE2000 already penalises hue error through its S_H term,
 * so this is not a correction — it is an intentional re-weighting, justified by
 * a perceptual asymmetry specific to foundation: a shade that is slightly too
 * light reads as natural, whereas a shade that is the right lightness but the
 * wrong undertone reads as a mask. Lightness errors are forgiven by blending;
 * hue errors are not.
 */
const MAX_UNDERTONE_PENALTY = 1.6;

/** Hue error, in degrees, at which {@link MAX_UNDERTONE_PENALTY} is reached. */
const UNDERTONE_SATURATION_DEGREES = 30;

/** ± L* window defining "colours at roughly the user's depth". */
const LOCAL_DEPTH_WINDOW = 8;

/**
 * Below this local hue span the palette genuinely cannot tell undertones apart,
 * so the penalty is switched off rather than applied to noise.
 *
 * 5° is about the measurement noise of sampling skin from a phone photo, so a
 * palette whose neighbours differ by less than that is offering no signal.
 */
const HUE_SPAN_FLOOR = 5;

/** Local hue span at which the penalty reaches full weight. */
const HUE_SPAN_CEILING = 22;

/** |ΔL*| below which a shade counts as level with the ranking colour. */
const LEVEL_DEPTH_TOLERANCE = 1.5;

/** ΔE window that still counts as "the same neighbourhood" as the winner. */
const RANGE_DELTA_E = 2.5;

/** Never hand back more than this many shades as "the range". */
const RANGE_CAP = 3;

/**
 * ΔE gap within which two colours are treated as tied, so a weaker signal is
 * allowed to break the tie. Roughly the just-noticeable difference.
 */
const TIE_BAND = 0.6;

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

type Member = { shade: ShadeRow; product: ProductRow };

type ColourGroup = {
  /** Key used to collapse duplicates: `match_hex` when present, else `shade_hex`. */
  hex: string;
  lab: Lab;
  hue: number;
  /** AR hex of the representative, filled when the match is built. */
  members: Member[];
};

function normaliseHex(hex: string): string {
  return `#${hex.trim().replace(/^#/, "").toUpperCase()}`;
}

/**
 * Colour the ranker compares. `match_hex` wins when it parses, so two brands
 * that share a generic `shade_hex` but have different real colours stay apart.
 * Missing column / null / bad text falls back to `shade_hex`.
 */
function colourForRanking(shade: ShadeRow): { groupHex: string; lab: Lab } | null {
  if (shade.match_hex) {
    const matchLab = hexToLab(shade.match_hex);
    if (matchLab) return { groupHex: normaliseHex(shade.match_hex), lab: matchLab };
  }
  if (!shade.shade_hex) return null;
  const lab = hexToLab(shade.shade_hex);
  if (!lab) return null;
  return { groupHex: normaliseHex(shade.shade_hex), lab };
}

/**
 * Reuses the same finish scoring idea as the catalog's product-profile matcher:
 * an exact finish match is best, matte and satin are near neighbours, and
 * anything else is neutral. Lower is better so it can sort directly.
 */
function finishRank(finish: string | null, preference: string | null | undefined): number {
  if (!preference || !finish) return 1;
  const f = finish.trim().toLowerCase();
  const p = preference.trim().toLowerCase();
  if (f === p) return 0;
  const adjacent =
    (f === "matte" && p === "satin") ||
    (f === "satin" && p === "matte") ||
    (f === "dewy" && p === "satin") ||
    (f === "satin" && p === "dewy");
  return adjacent ? 0.5 : 1;
}

/**
 * Picks which product represents a shared colour.
 *
 * Necessary because this catalog sells the same 18 colours across 12 brands: an
 * ungrouped top-5 would be the word "Ivory" five times. Preference order is the
 * user's finish, then price, then the brand's own shade ordering, then the key —
 * the last two only so the choice is stable across requests rather than
 * whatever order Postgres returned.
 */
function pickRepresentative(members: Member[], finishPreference: string | null | undefined): Member {
  return [...members].sort((x, y) => {
    const fx = finishRank(x.product.finish, finishPreference);
    const fy = finishRank(y.product.finish, finishPreference);
    if (fx !== fy) return fx - fy;

    const px = x.product.price ?? Number.POSITIVE_INFINITY;
    const py = y.product.price ?? Number.POSITIVE_INFINITY;
    if (px !== py) return px - py;

    const ox = x.shade.shade_order ?? Number.POSITIVE_INFINITY;
    const oy = y.shade.shade_order ?? Number.POSITIVE_INFINITY;
    if (ox !== oy) return ox - oy;

    return x.shade.shade_key.localeCompare(y.shade.shade_key);
  })[0];
}

/** Smallest angle between two hues, degrees, accounting for the 360° wrap. */
function hueDifference(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

function spanOf(values: number[]): number {
  if (values.length < 2) return 0;
  return Math.max(...values) - Math.min(...values);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ranks foundation shades against a measured skin colour.
 *
 * The ranking key is ΔE2000 plus an *adaptive* undertone penalty. Adaptive is
 * the important word: the penalty's weight is derived from how much hue variation
 * the palette actually contains at the user's depth. If every shade a user could
 * plausibly wear is the same hue, no undertone judgement is possible, the weight
 * falls to zero, and the reason strings say so instead of claiming an undertone
 * match the data cannot support.
 *
 * The catalog's own `undertone` column is deliberately *not* used as a colour
 * signal. In this database its value is a function of lightness — the two
 * lightest colours are labelled Cool, the middle band Warm, and both the light
 * and deep ends Neutral — so treating it as an undertone axis would encode a
 * depth label twice and call the result undertone matching. It is kept only to
 * break ties between colours that are already perceptually indistinguishable,
 * where it can do no harm, and is echoed back to the UI as the brand's claim.
 */
export function rankFoundationShades(
  shades: ShadeRow[],
  products: ProductRow[],
  options: RankOptions
): RankResult {
  const { skinLab, undertone, finishPreference = null, limit = 5, confidenceLabel } = options;
  const productByKey = new Map(products.map((p) => [p.product_key, p]));

  // ── Group rows into distinct colours ──────────────────────────────────────
  const groups = new Map<string, ColourGroup>();
  let considered = 0;

  for (const shade of shades) {
    const product = productByKey.get(shade.product_key);
    // An inactive or missing product cannot be recommended, however good the
    // colour match is.
    if (!product || product.is_active === false) continue;

    const ranked = colourForRanking(shade);
    if (!ranked) continue; // unparseable hex — drop the row, do not guess

    considered++;
    const existing = groups.get(ranked.groupHex);
    if (existing) {
      existing.members.push({ shade, product });
    } else {
      groups.set(ranked.groupHex, {
        hex: ranked.groupHex,
        lab: ranked.lab,
        hue: hueAngle(ranked.lab),
        members: [{ shade, product }],
      });
    }
  }

  const allGroups = [...groups.values()];

  // ── Measure what the palette can discriminate ────────────────────────────
  const lightnesses = allGroups.map((g) => g.lab.L);
  const localGroups = allGroups.filter(
    (g) => Math.abs(g.lab.L - skinLab.L) <= LOCAL_DEPTH_WINDOW
  );
  // Fewer than two neighbours means there is nothing to compare, so fall back to
  // the whole palette rather than reporting a meaningless span of 0.
  const hueSampleGroups = localGroups.length >= 2 ? localGroups : allGroups;
  const localHueSpan = spanOf(hueSampleGroups.map((g) => g.hue));
  const globalHueSpan = spanOf(allGroups.map((g) => g.hue));

  const undertoneWeight = Math.min(
    1,
    Math.max(0, (localHueSpan - HUE_SPAN_FLOOR) / (HUE_SPAN_CEILING - HUE_SPAN_FLOOR))
  );

  const notes: string[] = [];
  if (allGroups.length === 0) {
    notes.push("No foundation shade in the catalog has a usable colour value.");
  } else {
    const dupes = considered - allGroups.length;
    if (dupes > 0) {
      notes.push(
        `${considered} shade rows collapse to ${allGroups.length} distinct colours; ` +
          `${dupes} are the same colour sold under another brand.`
      );
    }
    if (undertoneWeight === 0) {
      notes.push(
        `Shades near this depth span only ${localHueSpan.toFixed(1)}° of hue, which is ` +
          `within measurement noise, so undertone cannot be used to rank them. ` +
          `Ranking is by depth and overall colour difference alone.`
      );
    } else if (undertoneWeight < 1) {
      notes.push(
        `Shades near this depth span ${localHueSpan.toFixed(1)}° of hue, so undertone ` +
          `is weighted at ${(undertoneWeight * 100).toFixed(0)}% of full strength.`
      );
    }
  }

  const diagnostics: PaletteDiagnostics = {
    shadeRowsConsidered: considered,
    distinctColours: allGroups.length,
    lightnessRange: {
      min: lightnesses.length ? Math.min(...lightnesses) : 0,
      max: lightnesses.length ? Math.max(...lightnesses) : 0,
      span: spanOf(lightnesses),
    },
    hueSpanDegrees: globalHueSpan,
    localHueSpanDegrees: localHueSpan,
    localColourCount: localGroups.length,
    undertoneWeight,
    notes,
  };

  if (allGroups.length === 0) {
    return { matches: [], lighterAlternate: null, deeperAlternate: null, diagnostics, shadeRange: [] };
  }

  // ── Score every colour ───────────────────────────────────────────────────
  const skinHue = hueAngle(skinLab);

  const scored = allGroups.map((group) => {
    const dE = deltaE2000(skinLab, group.lab);
    const hueError = hueDifference(skinHue, group.hue);
    const penalty =
      undertoneWeight *
      MAX_UNDERTONE_PENALTY *
      Math.min(1, hueError / UNDERTONE_SATURATION_DEGREES);
    return { group, dE, hueError, penalty, score: dE + penalty };
  });

  scored.sort((x, y) => {
    if (Math.abs(x.score - y.score) > TIE_BAND) return x.score - y.score;
    // Perceptually tied. Now — and only now — is the catalog's undertone word
    // allowed to matter, because at this distance it cannot make the match worse.
    const xLabelled = (x.group.members[0].shade.undertone ?? "").toLowerCase() === undertone;
    const yLabelled = (y.group.members[0].shade.undertone ?? "").toLowerCase() === undertone;
    if (xLabelled !== yLabelled) return xLabelled ? -1 : 1;
    return x.score - y.score;
  });

  const toMatch = (entry: (typeof scored)[number], rank: number): ShadeMatch => {
    const rep = pickRepresentative(entry.group.members, finishPreference);
    const others = entry.group.members
      .filter((m) => m.shade.shade_key !== rep.shade.shade_key)
      .map<AlternateSource>((m) => ({
        productKey: m.product.product_key,
        shadeKey: m.shade.shade_key,
        productName: m.product.name ?? m.product.product_key,
        brand: m.product.brand,
        price: m.product.price,
        finish: m.product.finish,
      }));

    const deltaL = entry.group.lab.L - skinLab.L;
    const depthDirection =
      Math.abs(deltaL) <= LEVEL_DEPTH_TOLERANCE
        ? "level"
        : deltaL > 0
          ? "lighter"
          : "deeper";

    const arHex = normaliseHex(rep.shade.shade_hex ?? entry.group.hex);
    const rankedHex = entry.group.hex;

    return {
      rank,
      deltaE: Number(entry.dE.toFixed(2)),
      quality: describeDeltaE(entry.dE),
      shadeHex: arHex,
      matchHex: rankedHex.toUpperCase() === arHex.toUpperCase() ? null : rankedHex,
      shadeName: rep.shade.shade_name ?? rep.shade.shade_key,
      shadeKey: rep.shade.shade_key,
      productKey: rep.product.product_key,
      productName: rep.product.name ?? rep.product.product_key,
      brand: rep.product.brand,
      price: rep.product.price,
      imageUrl: rep.product.image_url,
      finish: rep.product.finish,
      coverage: rep.product.coverage,
      catalogUndertone: rep.shade.undertone,
      depthDirection,
      deltaL: Number(deltaL.toFixed(1)),
      reason: buildReason({
        deltaE: entry.dE,
        deltaL,
        depthDirection,
        hueError: entry.hueError,
        undertoneWeight,
        undertone,
        finish: rep.product.finish,
        finishPreference,
        sharedWith: others.length,
        lowConfidence: confidenceLabel === "low",
      }),
      alsoAvailableFrom: others,
    };
  };

  const matches = scored.slice(0, Math.max(1, limit)).map((e, i) => toMatch(e, i + 1));

  // ── Lighter / deeper alternates ──────────────────────────────────────────
  //
  // Not simply ranks 2 and 3: those are usually the same direction as rank 1.
  // Someone who reads as between two shades wants one of each, and this catalog's
  // clean lightness ramp makes that a genuinely useful offer.
  const bestL = scored[0].group.lab.L;
  const nearestAbove = scored
    .filter((e) => e.group.lab.L > bestL + LEVEL_DEPTH_TOLERANCE)
    .sort((x, y) => x.group.lab.L - y.group.lab.L)[0];
  const nearestBelow = scored
    .filter((e) => e.group.lab.L < bestL - LEVEL_DEPTH_TOLERANCE)
    .sort((x, y) => y.group.lab.L - x.group.lab.L)[0];

  const bestDE = scored[0].dE;
  let rangeEntries = scored.filter((e) => e.dE <= bestDE + RANGE_DELTA_E);
  if (rangeEntries.length < 2) {
    const neighbours = [nearestAbove, nearestBelow].filter(
      (e): e is (typeof scored)[number] => e != null
    );
    const seen = new Set(rangeEntries.map((e) => e.group.hex));
    for (const n of neighbours) {
      if (!seen.has(n.group.hex)) {
        rangeEntries.push(n);
        seen.add(n.group.hex);
      }
    }
  }
  const shadeRange = rangeEntries.slice(0, RANGE_CAP).map((e, i) => toMatch(e, i + 1));

  return {
    matches,
    lighterAlternate: nearestAbove ? toMatch(nearestAbove, 0) : null,
    deeperAlternate: nearestBelow ? toMatch(nearestBelow, 0) : null,
    diagnostics,
    shadeRange,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reason strings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the sentence shown under a match.
 *
 * Every clause is derived from a number that is also returned in the payload, so
 * the wording can be checked rather than believed. In particular there is no
 * undertone clause at all when the palette could not support one — an empty
 * statement is better than a confident wrong one.
 */
function buildReason(input: {
  deltaE: number;
  deltaL: number;
  depthDirection: "lighter" | "deeper" | "level";
  hueError: number;
  undertoneWeight: number;
  undertone: Undertone;
  finish: string | null;
  finishPreference: string | null | undefined;
  sharedWith: number;
  lowConfidence: boolean;
}): string {
  const parts: string[] = [
    "Closest catalog colour to this reading, not a clinical measurement",
  ];

  // Depth — always meaningful, because lightness is what this palette resolves.
  if (input.depthDirection === "level") {
    parts.push("sits level with the depth used for matching");
  } else {
    const amount = Math.abs(input.deltaL);
    const size = amount < 3 ? "a touch" : amount < 7 ? "slightly" : "noticeably";
    parts.push(`runs ${size} ${input.depthDirection} than the depth used for matching`);
  }

  // Undertone — only when the palette earned the right to an opinion.
  if (input.undertoneWeight > 0) {
    if (input.hueError < 4) {
      parts.push(`undertone tracks your ${input.undertone} reading closely`);
    } else if (input.hueError < 10) {
      parts.push(`undertone is close to your ${input.undertone} reading`);
    } else {
      parts.push(`undertone pulls ${input.hueError.toFixed(0)}° off your ${input.undertone} reading`);
    }
  }

  // Finish — a real preference the catalog can honour, unlike undertone.
  if (input.finishPreference && input.finish) {
    if (finishRank(input.finish, input.finishPreference) === 0) {
      parts.push(`${input.finish} finish, as you prefer`);
    }
  }

  let sentence = `${parts.join("; ")}.`;
  sentence += ` ΔE ${input.deltaE.toFixed(1)} — ${describeDeltaE(input.deltaE).toLowerCase()}.`;

  if (input.lowConfidence) {
    sentence += " Confidence is low, so treat the nearby shades as a range rather than one certain winner.";
  }

  if (input.sharedWith > 0) {
    sentence += ` This exact colour is also sold by ${input.sharedWith} other ${
      input.sharedWith === 1 ? "product" : "products"
    }.`;
  }

  return sentence;
}

// ─────────────────────────────────────────────────────────────────────────────
// Undertone classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifies undertone from measured skin, corrected for depth.
 *
 * Fixed hue thresholds do not work here. Skin hue angle falls systematically as
 * skin deepens — in this project's own foundation ramp it runs from about 68° at
 * the lightest end to about 41° at the deepest — so a threshold that calls 45°
 * "cool" would label every deep complexion cool, which is both wrong and the
 * exact failure mode that makes shade finders feel broken for darker skin.
 *
 * So undertone is read as a *deviation* from the hue expected at that lightness.
 * `referenceHueAtLightness` supplies the expectation; the caller derives it from
 * the catalog's own ramp, which is real product data rather than a fitted guess.
 *
 * Olive is a separate case: it is not a hue but a *desaturation* — a
 * yellow-green cast that reads as muted rather than golden. It is therefore
 * detected as positive hue deviation combined with chroma well below what that
 * lightness normally carries.
 */
export function classifyUndertone(
  lab: Lab,
  reference: { hue: number; chroma: number }
): { undertone: Undertone; hueDeviation: number; chromaRatio: number } {
  const h = hueAngle(lab);
  const c = chroma(lab);
  const hueDeviation = h - reference.hue;
  const chromaRatio = reference.chroma > 0 ? c / reference.chroma : 1;

  // Muted and yellow-leaning at once: olive rather than warm.
  if (hueDeviation > 2 && chromaRatio < 0.85) {
    return { undertone: "olive", hueDeviation, chromaRatio };
  }
  // Cool is a pink/blue shift, not "a bit redder than the reference".
  // Hue around 42° (a* and b* both positive, still in the red–yellow sector)
  // is a warm reading. Labelling it cool because the depth reference sits
  // nearer yellow mislabels it.
  if (hueDeviation < -6 && h < 40) {
    return { undertone: "cool", hueDeviation, chromaRatio };
  }
  if (hueDeviation > 6) return { undertone: "warm", hueDeviation, chromaRatio };
  return { undertone: "neutral", hueDeviation, chromaRatio };
}

/**
 * Derives the neutral hue/chroma expected at a given lightness from the shade
 * palette itself, by least-squares line through the palette's distinct colours.
 *
 * Using the catalog rather than a hard-coded constant means the reference tracks
 * whatever shades are actually stocked, and it degrades safely: with fewer than
 * three colours there is nothing to fit, so the caller gets `null` and can fall
 * back rather than extrapolate from two points.
 */
export function fitReferenceRamp(
  shades: ShadeRow[]
): ((L: number) => { hue: number; chroma: number }) | null {
  const seen = new Set<string>();
  const points: { L: number; hue: number; chroma: number }[] = [];

  for (const s of shades) {
    const lab = hexToLab(s.shade_hex);
    if (!lab) continue;
    const hex = normaliseHex(s.shade_hex as string);
    if (seen.has(hex)) continue;
    seen.add(hex);
    points.push({ L: lab.L, hue: hueAngle(lab), chroma: chroma(lab) });
  }

  if (points.length < 3) return null;

  const fit = (pick: (p: (typeof points)[number]) => number) => {
    const n = points.length;
    const sx = points.reduce((t, p) => t + p.L, 0);
    const sy = points.reduce((t, p) => t + pick(p), 0);
    const sxx = points.reduce((t, p) => t + p.L * p.L, 0);
    const sxy = points.reduce((t, p) => t + p.L * pick(p), 0);
    const denom = n * sxx - sx * sx;
    // Every colour at the same lightness: no slope is defined, so use the mean.
    if (Math.abs(denom) < 1e-9) return { slope: 0, intercept: sy / n };
    const slope = (n * sxy - sx * sy) / denom;
    return { slope, intercept: (sy - slope * sx) / n };
  };

  const hueFit = fit((p) => p.hue);
  const chromaFit = fit((p) => p.chroma);

  return (L: number) => ({
    hue: hueFit.slope * L + hueFit.intercept,
    // Chroma cannot be negative, and a badly extrapolated zero would make every
    // ratio explode in classifyUndertone.
    chroma: Math.max(1, chromaFit.slope * L + chromaFit.intercept),
  });
}
