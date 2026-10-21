/**
 * Maps a measured facial Lab colour onto this catalog's foundation swatch scale.
 *
 * The chips shipped with the catalog run from Porcelain (L* ≈ 92) to Ebony
 * (L* ≈ 21). A phone reading of a light face usually lands near L* 65–72.
 * Ranking that number directly against the chips picks Sand (L* ≈ 69), which
 * looks too dark on the face. The curve below is a documented prior — not a fit
 * to volunteer photos, because those photos have not been collected yet.
 *
 * Anchors, measured L* → catalog L*:
 *   72 (light)  → ~82, Natural Beige / Buff (80–84), not Sand (69)
 *   65          → 80, so the rest of the light phone band (about 65–72) clears Sand
 *   62 (medium) → ~60, Honey / Golden Beige (57–63)
 *   45 (tan)    → ~45.5, Caramel / Chestnut (42–49)
 *   30 (deep)   → ~29, Cocoa / Mocha (26–32)
 *
 * The curve is strictly monotone. a* and b* move by at most 2, so this is not
 * a chroma boost. Replace the knots once `scripts/foundation-eval.ts` has real
 * samples with a recorded reference.
 */

import { type Lab, chroma, hueAngle } from "./color";
import { skinReference } from "./analyze";

/** Bump when the knots change so a stored reading can name the curve that made it. */
export const SWATCH_MAP_VERSION = "prior-v1";

/**
 * [measured L*, catalog L*]. Ascending in both columns — monotone by construction.
 * End knots keep very light and very deep readings on the palette instead of
 * extrapolating the steep light-end slope forever.
 */
const L_KNOTS: readonly (readonly [number, number])[] = [
  [15, 18],
  [30, 29],
  [45, 45.5],
  [62, 60],
  // Phone readings of light faces sit around 65–72 and used to match Sand (L* ~69).
  // The rise is steep on purpose so that band lands on the beige chips.
  [65, 80],
  [72, 82],
  [90, 93],
];

/** Largest a* or b* nudge. A bigger shift would invent chroma the photo did not have. */
const MAX_AB_SHIFT = 2;

/** Fraction of the way from the measured chroma toward the skin reference. */
const AB_PULL = 0.1;

function mapLightness(L: number): number {
  const first = L_KNOTS[0];
  const last = L_KNOTS[L_KNOTS.length - 1];
  if (L <= first[0]) {
    // Flat outside the first knot: do not steepen the deep end.
    return first[1] + (L - first[0]) * 0.4;
  }
  if (L >= last[0]) {
    return last[1] + (L - last[0]) * 0.35;
  }
  for (let i = 1; i < L_KNOTS.length; i++) {
    const [x1, y1] = L_KNOTS[i];
    if (L <= x1) {
      const [x0, y0] = L_KNOTS[i - 1];
      const t = (L - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Catalog-scale Lab used only for ranking shades.
 * ITA°, undertone words, and the swatch shown as "your skin" stay on the raw lab.
 */
export function mapSkinToSwatch(lab: Lab): Lab {
  const L = mapLightness(lab.L);
  const ref = skinReference(L);
  const h = (hueAngle(lab) * Math.PI) / 180;
  const c = chroma(lab);
  // Pull a hair toward the hue expected at the mapped depth. The magnitude is
  // capped, and a low-chroma deep complexion is not pushed up to chroma 20.
  const targetC = Math.min(ref.chroma, Math.max(c, 1));
  const targetA = targetC * Math.cos(h);
  const targetB = targetC * Math.sin(h);
  // Keep the measured hue; only the chroma magnitude may move, and only slightly.
  const da = clamp(AB_PULL * (targetA - lab.a), -MAX_AB_SHIFT, MAX_AB_SHIFT);
  const db = clamp(AB_PULL * (targetB - lab.b), -MAX_AB_SHIFT, MAX_AB_SHIFT);
  return { L, a: lab.a + da, b: lab.b + db };
}

/** True when each step of measured L* maps to a greater or equal catalog L*. */
export function swatchMapIsMonotone(step = 1): boolean {
  let prev = mapLightness(0);
  for (let L = step; L <= 100; L += step) {
    const next = mapLightness(L);
    if (next + 1e-9 < prev) return false;
    prev = next;
  }
  return true;
}
