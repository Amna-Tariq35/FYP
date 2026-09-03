/**
 * Colour science for foundation shade matching.
 *
 * Everything here is hand-written from the published formulae — no dependency —
 * because this is the part of the project that is an actual algorithmic
 * contribution rather than glue code. Sources are cited per function so the
 * numbers can be checked against the standards rather than trusted.
 *
 * Pure functions only: no I/O, no framework imports. That keeps it runnable from
 * a unit test, from the API route, and later from the browser.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Non-linear sRGB, 0–255 per channel — what a camera hands you. */
export type Rgb = { r: number; g: number; b: number };

/** CIE 1976 L*a*b*, D65 illuminant / 2° observer. */
export type Lab = { L: number; a: number; b: number };

/** Undertone vocabulary — matches the `undertone` check constraint in the DB. */
export type Undertone = "cool" | "neutral" | "warm" | "olive";

/** Depth vocabulary — matches the `depth_level` check constraint in the DB. */
export type DepthLevel = "fair" | "light" | "medium" | "tan" | "deep" | "rich";

// ─────────────────────────────────────────────────────────────────────────────
// Hex ↔ RGB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses `#RRGGBB` / `RRGGBB` / `#RGB`. Returns null rather than throwing or
 * guessing: a bad `shade_hex` in the catalog must drop that shade out of the
 * ranking, not poison the whole match with NaN.
 */
export function hexToRgb(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// sRGB → CIELAB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sRGB inverse companding (IEC 61966-2-1). Camera pixels are gamma-encoded; all
 * the colour arithmetic below is only valid on linear light, so this has to run
 * first. Skipping it is the single most common reason naive skin-tone matchers
 * are wrong at the light and dark ends of the range.
 */
function srgbToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(linear: number): number {
  const c =
    linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

/** D65 white point, 2° observer (CIE 15:2004). */
const WHITE_D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

/** sRGB → XYZ matrix, D65 (IEC 61966-2-1 Annex A). */
function linearRgbToXyz(R: number, G: number, B: number) {
  return {
    X: R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    Y: R * 0.2126729 + G * 0.7151522 + B * 0.0721750,
    Z: R * 0.0193339 + G * 0.1191920 + B * 0.9503041,
  };
}

/** CIE 15:2004 §8.2.1. The 6/29 branch avoids the cube root's infinite slope at 0. */
function labF(t: number): number {
  const DELTA = 6 / 29;
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA ** 2) + 4 / 29;
}

function labFInv(t: number): number {
  const DELTA = 6 / 29;
  return t > DELTA ? t ** 3 : 3 * DELTA ** 2 * (t - 4 / 29);
}

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const { X, Y, Z } = linearRgbToXyz(
    srgbToLinear(r),
    srgbToLinear(g),
    srgbToLinear(b)
  );
  const fx = labF(X / WHITE_D65.X);
  const fy = labF(Y / WHITE_D65.Y);
  const fz = labF(Z / WHITE_D65.Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Inverse of {@link rgbToLab}. Used to render a measured skin tone as a swatch. */
export function labToRgb({ L, a, b }: Lab): Rgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const X = labFInv(fx) * WHITE_D65.X;
  const Y = labFInv(fy) * WHITE_D65.Y;
  const Z = labFInv(fz) * WHITE_D65.Z;
  const R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  const G = X * -0.9692660 + Y * 1.8760108 + Z * 0.0415560;
  const B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  return { r: linearToSrgb(R), g: linearToSrgb(G), b: linearToSrgb(B) };
}

export function hexToLab(hex: string | null | undefined): Lab | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToLab(rgb) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived polar quantities
// ─────────────────────────────────────────────────────────────────────────────

/** C*ab — chroma. How saturated the colour is, independent of hue. */
export function chroma({ a, b }: Lab): number {
  return Math.hypot(a, b);
}

/**
 * h°ab — CIELAB hue angle in degrees, 0–360.
 *
 * For skin this is the undertone axis: a* is redness, b* is yellowness, so a
 * larger angle leans golden/warm and a smaller one leans pink/cool.
 */
export function hueAngle({ a, b }: Lab): number {
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Individual Typology Angle — ITA°, the standard instrumental measure of
 * constitutive skin pigmentation.
 *
 *   ITA° = arctan((L* − 50) / b*) × 180 / π
 *
 * Chardon A., Cretois I., Hourseau C. (1991), "Skin colour typology and
 * suntanning pathways", Int. J. Cosmet. Sci. 13(4):191–208. Class boundaries
 * follow Del Bino S. & Bernerd F. (2013), Br. J. Dermatol. 169(s3):33–40.
 *
 * ITA° is preferred over raw L* here because it folds in yellowness, which is
 * what separates a genuinely light complexion from a washed-out photograph.
 */
export function itaDegrees({ L, b }: Lab): number {
  // b* ≈ 0 would blow up; skin is never truly achromatic, but a badly
  // white-balanced photo can get close, so guard it.
  const safeB = Math.abs(b) < 1e-6 ? (b < 0 ? -1e-6 : 1e-6) : b;
  return (Math.atan((L - 50) / safeB) * 180) / Math.PI;
}

/**
 * Del Bino's six ITA° classes, renamed to the six values the `depth_level`
 * column accepts. Deriving depth from ITA° rather than inventing L* bands means
 * the label and the number can never disagree.
 *
 *   very light > 55 → fair      intermediate 28..41 → medium
 *   light   41..55 → light      tan          10..28 → tan
 *   brown  −30..10 → deep       dark          < −30 → rich
 */
export function depthFromIta(ita: number): DepthLevel {
  if (ita > 55) return "fair";
  if (ita > 41) return "light";
  if (ita > 28) return "medium";
  if (ita > 10) return "tan";
  if (ita > -30) return "deep";
  return "rich";
}

// ─────────────────────────────────────────────────────────────────────────────
// Monk Skin Tone Scale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ten official Monk Skin Tone Scale swatches.
 *
 * Monk, E. (2023), "The Monk Skin Tone Scale", SocArXiv; released by Google in
 * 2022 as a more equitable alternative to Fitzpatrick for computer vision.
 * Cited by number in the DB (`monk_scale smallint`), which is why a published
 * scale was chosen over a home-made one.
 */
export const MONK_SWATCHES: readonly string[] = [
  "#f6ede4", "#f3e7db", "#f7ead0", "#eadaba", "#d7bd96",
  "#a07e56", "#825c43", "#604134", "#3a312a", "#292420",
];

const MONK_LABS: readonly Lab[] = MONK_SWATCHES.map(
  (hex) => rgbToLab(hexToRgb(hex)!)
);

/** ITA° of each swatch. Strictly decreasing: 83 → 80 → 72 → … → −78 → −84. */
const MONK_ITAS: readonly number[] = MONK_LABS.map((lab) => itaDegrees(lab));

/**
 * Nearest Monk tone, 1–10, binned on ITA° rather than by ΔE2000 to the swatch.
 *
 * ΔE2000 was the first thing tried, on the reasoning that using one metric
 * everywhere keeps the answers consistent. Measured against realistic
 * complexions it does not work, for two reasons that only show up in the data:
 *
 *  - The swatches are far less chromatic than faces (four of them sit at
 *    C\* < 18, two below 7, where real skin is nearer 20). A full-colour nearest
 *    neighbour therefore lands on whichever swatch happens to match in *chroma*,
 *    and sweeping a realistic skin ramp from L\* 90 down to 15 only ever returns
 *    tones {2, 5, 6, 7, 8} — swatches 3–4 and 9–10 are unreachable, so every
 *    complexion below L\* 38 reports Monk 8 and the deep end of the scale is
 *    thrown away.
 *  - The swatches are not even monotone in L\* (swatch 3 is *lighter* than
 *    swatch 2), so any lightness-nearest mapping can invert as well.
 *
 * They *are* strictly monotone in ITA°, which is the axis skin depth is actually
 * measured on (Chardon et al. 1991) and the axis the scale is ordered by. Binning
 * there uses the whole scale and cannot invert: a deeper complexion can never
 * report a lower tone number than a lighter one.
 *
 * The scale stays consistent with the shade ranking because both are ultimately
 * ordered by depth; what is dropped is only the pretence that a ten-swatch
 * illustrative palette can resolve chroma.
 */
export function monkToneFor(lab: Lab): number {
  const ita = itaDegrees(lab);
  let best = 1;
  let bestD = Infinity;
  for (let i = 0; i < MONK_ITAS.length; i++) {
    const d = Math.abs(ita - MONK_ITAS[i]);
    if (d < bestD) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// CIEDE2000
// ─────────────────────────────────────────────────────────────────────────────

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/**
 * CIEDE2000 colour difference, ΔE00.
 *
 * CIE 142-2001; implemented against the worked formulation and the 34-pair test
 * set in Sharma G., Wu W., Dalal E. (2005), "The CIEDE2000 color-difference
 * formula: implementation notes, supplementary test data, and mathematical
 * observations", Color Res. Appl. 30(1):21–30.
 *
 * Plain Euclidean ΔE76 is not good enough for this feature: CIELAB is badly
 * non-uniform in exactly the region skin occupies (low-to-moderate chroma,
 * yellow-red hues), so ΔE76 systematically over-weights chroma differences and
 * would rank an obviously-too-orange foundation above a good match. ΔE00 adds
 * the lightness/chroma/hue weighting functions (S_L, S_C, S_H) and the
 * blue-region rotation term R_T that correct for this.
 *
 * kL = kC = kH = 1 (reference conditions).
 */
export function deltaE2000(lab1: Lab, lab2: Lab, kL = 1, kC = 1, kH = 1): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const cBar = (C1 + C2) / 2;

  // G rescales a* so that near-neutral colours are compared on a hue axis that
  // does not collapse — the fix for CIELAB's poor performance close to grey.
  const cBar7 = Math.pow(cBar, 7);
  const G = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  // atan2 of an achromatic colour is meaningless; the standard defines h' = 0.
  const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) * DEG + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) * DEG + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * RAD) / 2);

  const lBarP = (L1 + L2) / 2;
  const cBarP = (C1p + C2p) / 2;

  let hBarP: number;
  if (C1p * C2p === 0) hBarP = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
  else hBarP = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos((hBarP - 30) * RAD) +
    0.24 * Math.cos(2 * hBarP * RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * RAD) -
    0.20 * Math.cos((4 * hBarP - 63) * RAD);

  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2));
  const cBarP7 = Math.pow(cBarP, 7);
  const RC = 2 * Math.sqrt(cBarP7 / (cBarP7 + Math.pow(25, 7)));

  const SL =
    1 +
    (0.015 * Math.pow(lBarP - 50, 2)) / Math.sqrt(20 + Math.pow(lBarP - 50, 2));
  const SC = 1 + 0.045 * cBarP;
  const SH = 1 + 0.015 * cBarP * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const termL = dLp / (kL * SL);
  const termC = dCp / (kC * SC);
  const termH = dHp / (kH * SH);

  return Math.sqrt(
    termL * termL + termC * termC + termH * termH + RT * termC * termH
  );
}

/**
 * How a ΔE00 figure should be described to a person.
 *
 * The banding follows the widely used interpretation of ΔE00 in which ~1.0 is
 * the just-noticeable difference for a trained observer under controlled
 * viewing. Foundation is judged on skin at arm's length, not in a light booth,
 * so the bands here are deliberately more forgiving than a print-industry
 * tolerance would be.
 */
export function describeDeltaE(dE: number): string {
  if (dE < 1.5) return "Practically indistinguishable";
  if (dE < 3) return "Very close match";
  if (dE < 5) return "Close match";
  if (dE < 8) return "Noticeably different";
  return "Clearly different";
}
