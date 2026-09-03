/**
 * Foundation shade-match verification.
 *
 *     npm run verify:foundation
 *
 * Three things get checked, because three different things can be wrong:
 *
 *  1. **Is the colour maths correct?** ΔE2000 is checked against the 34 published
 *     test pairs from Sharma, Wu & Dalal, "The CIEDE2000 Color-Difference
 *     Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 *     Observations", Color Research & Application 30(1):21–30, 2005. Those pairs
 *     are chosen specifically to exercise the branches every naive
 *     implementation gets wrong — the hue-angle quadrant wraparound, achromatic
 *     colours where hue is undefined, and the RT rotation term near 275°. An
 *     implementation that agrees to four decimal places on all 34 is correct;
 *     one that only agrees on "reasonable" colours is not.
 *
 *  2. **Is the pipeline sane?** sRGB↔Lab round-trips, ITA° depth boundaries, and
 *     the quality gates are exercised with synthetic inputs.
 *
 *  3. **Can the actual catalog answer the question?** The real `fnd_*` shades are
 *     pulled from Supabase and matched against six synthetic complexions
 *     spanning fair to rich, printing the diagnostics. This is the part that
 *     tells the truth about what the feature can claim.
 *
 * Steps 1 and 2 are offline. Step 3 needs Supabase env vars and is skipped
 * without them, so the maths can still be verified with no network.
 */

import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  type Lab,
  MONK_SWATCHES,
  chroma,
  deltaE2000,
  depthFromIta,
  hexToLab,
  labToRgb,
  hexToRgb,
  itaDegrees,
  hueAngle,
  monkToneFor,
  rgbToHex,
  rgbToLab,
} from "../src/lib/foundation/color";
import {
  type ShadeRow,
  type ProductRow,
  classifyUndertone,
  rankFoundationShades,
} from "../src/lib/foundation/match";
import {
  type SkinPatch,
  analyseSkin,
  parseIlluminant,
  parsePatches,
  skinReference,
} from "../src/lib/foundation/analyze";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ── Reporting ────────────────────────────────────────────────────────────────

type Status = "pass" | "fail" | "warn" | "skip";

const results: { status: Status; title: string; detail: string }[] = [];

const ICON: Record<Status, string> = {
  pass: "\x1b[32m✔\x1b[0m",
  fail: "\x1b[31m✘\x1b[0m",
  warn: "\x1b[33m!\x1b[0m",
  skip: "\x1b[90m–\x1b[0m",
};

function record(status: Status, title: string, detail = "") {
  results.push({ status, title, detail });
  console.log(`${ICON[status]} ${title}`);
  if (detail) console.log(`  \x1b[90m${detail}\x1b[0m`);
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function note(text: string) {
  console.log(`  \x1b[90m${text}\x1b[0m`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CIEDE2000 against the published test data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sharma/Wu/Dalal supplementary test data, table 1. Columns are
 * L1 a1 b1 L2 a2 b2 expected-ΔE00.
 */
const CIEDE2000_TEST_DATA: [number, number, number, number, number, number, number][] = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

function verifyDeltaE2000() {
  section("CIEDE2000 vs Sharma/Wu/Dalal (2005) test data");

  const failures: string[] = [];
  let worstError = 0;

  for (const [i, row] of CIEDE2000_TEST_DATA.entries()) {
    const [l1, a1, b1, l2, a2, b2, expected] = row;
    const got = deltaE2000({ L: l1, a: a1, b: b1 }, { L: l2, a: a2, b: b2 });
    const error = Math.abs(got - expected);
    if (error > worstError) worstError = error;
    // The published table is given to 4 decimal places, so 1e-4 is the tightest
    // tolerance the data itself supports.
    if (error > 1e-4) {
      failures.push(`pair ${i + 1}: expected ${expected}, got ${got.toFixed(4)}`);
    }
  }

  if (failures.length === 0) {
    record(
      "pass",
      `All ${CIEDE2000_TEST_DATA.length} published CIEDE2000 pairs match`,
      `Worst absolute error ${worstError.toExponential(2)} — within the 4-decimal precision of the published table.`
    );
  } else {
    record(
      "fail",
      `${failures.length} of ${CIEDE2000_TEST_DATA.length} CIEDE2000 pairs disagree`,
      failures.slice(0, 6).join("; ")
    );
  }

  // Symmetry is a property of the formula, not of the test data, and a
  // mis-signed hue difference passes many pairs while breaking this.
  let asymmetric = 0;
  for (const [l1, a1, b1, l2, a2, b2] of CIEDE2000_TEST_DATA) {
    const fwd = deltaE2000({ L: l1, a: a1, b: b1 }, { L: l2, a: a2, b: b2 });
    const rev = deltaE2000({ L: l2, a: a2, b: b2 }, { L: l1, a: a1, b: b1 });
    if (Math.abs(fwd - rev) > 1e-9) asymmetric++;
  }
  record(
    asymmetric === 0 ? "pass" : "fail",
    "ΔE2000 is symmetric in its arguments",
    asymmetric === 0 ? "" : `${asymmetric} pairs differ when swapped.`
  );

  // Identity: a colour is zero distance from itself, including achromatic ones
  // where h′ is undefined and must be forced to 0 rather than produce NaN.
  const identities: Lab[] = [
    { L: 50, a: 0, b: 0 },
    { L: 0, a: 0, b: 0 },
    { L: 100, a: 0, b: 0 },
    { L: 62, a: 12, b: 18 },
  ];
  const badIdentity = identities.filter((c) => {
    const d = deltaE2000(c, c);
    return !Number.isFinite(d) || Math.abs(d) > 1e-12;
  });
  record(
    badIdentity.length === 0 ? "pass" : "fail",
    "ΔE2000 of a colour against itself is exactly 0, including achromatic",
    badIdentity.length === 0 ? "" : `Failed for ${JSON.stringify(badIdentity)}.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Conversions, ITA, and the reference ramp
// ─────────────────────────────────────────────────────────────────────────────

function verifyConversions() {
  section("sRGB ↔ CIELAB");

  // Known anchors. D65 white is L*=100,a*=0,b*=0 by construction. It does not
  // land there *exactly*: the published sRGB→XYZ matrix coefficients are rounded
  // to 6 places, so white maps a hair off D65 and L* comes out 100.0000039. That
  // residual is the standard's, not ours — but it is orders of magnitude below
  // 8-bit precision, so the tolerance is set to catch a wrong reference white or
  // a wrong companding exponent, both of which move this by ≥0.01.
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  record(
    Math.abs(white.L - 100) < 1e-4 && Math.abs(white.a) < 1e-3 && Math.abs(white.b) < 1e-3
      ? "pass"
      : "fail",
    "White (255,255,255) → L*=100, a*=0, b*=0",
    `Got L*=${white.L.toFixed(6)} a*=${white.a.toFixed(6)} b*=${white.b.toFixed(6)} — residual is the standard matrix's own rounding.`
  );

  const black = rgbToLab({ r: 0, g: 0, b: 0 });
  record(
    Math.abs(black.L) < 1e-6 ? "pass" : "fail",
    "Black (0,0,0) → L*=0",
    `Got L*=${black.L.toFixed(4)}`
  );

  // Mid grey #808080. sRGB 128 is *not* 50% linear light — that is the whole
  // point of gamma — so L* lands near 53.6, not 50. A wrong (or missing)
  // companding step is most visible right here.
  const grey = rgbToLab({ r: 128, g: 128, b: 128 });
  record(
    Math.abs(grey.L - 53.585) < 0.01 ? "pass" : "fail",
    "Mid grey #808080 → L*≈53.59 (not 50 — sRGB is gamma-encoded)",
    `Got L*=${grey.L.toFixed(3)}`
  );

  // Round-trip over a spread of plausible skin colours.
  let worst = 0;
  let worstHex = "";
  for (let r = 40; r <= 250; r += 30) {
    for (let g = 20; g <= 230; g += 30) {
      for (let b = 10; b <= 220; b += 30) {
        const hex = rgbToHex({ r, g, b });
        const back = hexToLab(hex);
        if (!back) continue;
        const round = rgbToHex(
          hexToRgb(rgbToHex({ r, g, b })) ?? { r: 0, g: 0, b: 0 }
        );
        if (round !== hex) {
          worst = 999;
          worstHex = hex;
        }
        const d = deltaE2000(rgbToLab({ r, g, b }), back);
        if (d > worst) {
          worst = d;
          worstHex = hex;
        }
      }
    }
  }
  record(
    worst < 0.5 ? "pass" : "fail",
    "hex → Lab agrees with rgb → Lab across the colour cube",
    `Worst ΔE ${worst.toFixed(4)} at ${worstHex} (rounding to 8-bit hex only).`
  );

  section("ITA° and depth classification");

  // Del Bino's classes are defined on ITA°, so the boundaries are what must
  // hold — check each side of every one rather than a few sample colours.
  const boundaries: [number, string][] = [
    [70, "fair"],
    [56, "fair"],
    [54, "light"],
    [42, "light"],
    [40, "medium"],
    [29, "medium"],
    [27, "tan"],
    [11, "tan"],
    [9, "deep"],
    [-29, "deep"],
    [-31, "rich"],
    [-50, "rich"],
  ];
  const wrong = boundaries.filter(([ita, want]) => depthFromIta(ita) !== want);
  record(
    wrong.length === 0 ? "pass" : "fail",
    "ITA° boundaries map onto the six depth_level values",
    wrong.length === 0
      ? "fair >55, light >41, medium >28, tan >10, deep >−30, rich below."
      : `Wrong: ${wrong.map(([i, w]) => `${i}→${w}`).join(", ")}`
  );

  // ITA must fall monotonically as skin deepens, or "lighter/deeper" is a lie.
  const ramp = MONK_SWATCHES.map((hex) => {
    const lab = hexToLab(hex)!;
    return { hex, lab, ita: itaDegrees(lab), hue: hueAngle(lab), chroma: chroma(lab) };
  });
  let monotonic = true;
  for (let i = 1; i < ramp.length; i++) {
    if (ramp[i].ita > ramp[i - 1].ita + 1e-9) monotonic = false;
  }
  record(
    monotonic ? "pass" : "warn",
    "ITA° decreases monotonically along the Monk scale",
    `ITA ${ramp.map((r) => r.ita.toFixed(0)).join(" → ")}`
  );

  // monkToneFor must return each swatch's own index for that swatch.
  const misassigned = MONK_SWATCHES.map((hex, i) => ({
    hex,
    want: i + 1,
    got: monkToneFor(hexToLab(hex)!),
  })).filter((x) => x.want !== x.got);
  record(
    misassigned.length === 0 ? "pass" : "fail",
    "Each Monk swatch classifies as its own tone number",
    misassigned.length === 0
      ? ""
      : misassigned.map((x) => `${x.hex} wanted ${x.want} got ${x.got}`).join(", ")
  );

  // The scale is ordinal, so a deeper complexion must never report a lower tone
  // number than a lighter one, and the mapping should be able to reach the whole
  // scale for realistic skin. Both fail if the mapping uses full colour distance:
  // the swatches are much less chromatic than faces, which strands 3–4 and 9–10.
  const sweep: { L: number; tone: number }[] = [];
  for (let L = 90; L >= 15; L -= 1) {
    sweep.push({ L, tone: monkToneFor(typicalSkinAt(L).lab) });
  }
  const inversions = sweep.filter((s, i) => i > 0 && s.tone < sweep[i - 1].tone);
  record(
    inversions.length === 0 ? "pass" : "fail",
    "Monk tone never decreases as a realistic complexion deepens",
    inversions.length === 0
      ? `L* 90→15 walks tones ${[...new Set(sweep.map((s) => s.tone))].join(" → ")}.`
      : `${inversions.length} inversions, first at L* ${inversions[0].L}.`
  );

  // Surjectivity has to be probed along the *Monk locus*, not along the ramp
  // above. The ramp holds chroma at a constant 20, which is right in the middle
  // of the range but wrong at both ends — measured, real skin loses chroma as it
  // approaches either extreme (Monk 1 sits at C* 5.6, Monk 10 at C* 3.8), so a
  // fixed-chroma ramp simply never visits the corners of the gamut where tones
  // 1–3 and 9–10 live. Walking between consecutive swatches varies chroma the way
  // skin actually does, and that is the path a real population spreads along.
  const locus: number[] = [];
  for (let i = 0; i < MONK_SWATCHES.length - 1; i++) {
    const from = hexToLab(MONK_SWATCHES[i])!;
    const to = hexToLab(MONK_SWATCHES[i + 1])!;
    for (let t = 0; t < 1; t += 0.02) {
      locus.push(
        monkToneFor({
          L: from.L + (to.L - from.L) * t,
          a: from.a + (to.a - from.a) * t,
          b: from.b + (to.b - from.b) * t,
        })
      );
    }
  }
  const reachable = new Set(locus);
  record(
    reachable.size === 10 ? "pass" : "fail",
    `${reachable.size} of 10 Monk tones are reachable along the skin locus`,
    reachable.size === 10
      ? `Fixed-chroma ramp L* 90→15 spans tones ${[...new Set(sweep.map((s) => s.tone))].join(", ")}; the full scale opens up once chroma varies with depth as real skin does.`
      : `Only {${[...reachable].join(", ")}} can ever be reported, so the rest of the scale is dead.`
  );

  section("Monk swatches measured — why they bin depth but cannot set a hue reference");
  for (const [i, r] of ramp.entries()) {
    note(
      `${String(i + 1).padStart(2)} ${r.hex}  L* ${r.lab.L.toFixed(1).padStart(5)}  ` +
        `a* ${r.lab.a.toFixed(1).padStart(5)}  b* ${r.lab.b.toFixed(1).padStart(5)}  ` +
        `hue ${r.hue.toFixed(1).padStart(5)}°  C* ${r.chroma.toFixed(1).padStart(4)}  ` +
        `ITA ${r.ita.toFixed(0).padStart(4)}°`
    );
  }
  const nearZeroRed = ramp.filter((r) => r.lab.a < 2);
  record(
    nearZeroRed.length > 0 ? "warn" : "pass",
    nearZeroRed.length > 0
      ? `${nearZeroRed.length} Monk swatches have a* < 2, which real skin never does`
      : "All Monk swatches carry plausible skin redness",
    nearZeroRed.length > 0
      ? `${nearZeroRed.map((r) => r.hex).join(", ")} — haemoglobin puts a floor under a* in any real complexion. ` +
        `This is the measured reason the hue reference is literature-anchored instead of fitted over these swatches: ` +
        `a fit lands near 76° at light depths, so every light-skinned user would read ~18° low and be reported cool.`
      : ""
  );

  // The deepest published skin swatch must not trip the "too dark" gate.
  const deepest = hexToLab(MONK_SWATCHES[9])!;
  record(
    deepest.L > 6 ? "pass" : "fail",
    `Deepest Monk swatch sits at L* ${deepest.L.toFixed(1)}, above the black-frame floor`,
    "Any lightness floor above this rejects the deepest real complexions; underexposure is judged from the illuminant instead."
  );

  section("Neutral-skin reference ramp (literature-anchored)");
  for (const L of [80, 70, 60, 50, 40, 30, 20]) {
    const r = skinReference(L);
    note(`L* ${L} → expected hue ${r.hue.toFixed(1)}°, chroma ${r.chroma.toFixed(1)}`);
  }

  // The reference is only useful if it sits inside real skin values, and if
  // deliberately warm/cool variants of one lightness classify in opposite
  // directions. Build them by rotating hue around the reference.
  const testL = 60;
  const ref = skinReference(testL);
  const build = (hueOffset: number, chromaScale = 1): Lab => {
    const h = ((ref.hue + hueOffset) * Math.PI) / 180;
    const c = ref.chroma * chromaScale;
    return { L: testL, a: c * Math.cos(h), b: c * Math.sin(h) };
  };
  const cases: [number, number, string][] = [
    [-14, 1, "cool"],
    [0, 1, "neutral"],
    [14, 1, "warm"],
    [8, 0.7, "olive"],
  ];
  const undertoneErrors = cases
    .map(([off, scale, want]) => ({
      off,
      want,
      got: classifyUndertone(build(off, scale), ref).undertone,
    }))
    .filter((x) => x.got !== x.want);
  record(
    undertoneErrors.length === 0 ? "pass" : "fail",
    "Hue rotated ±14° about the reference classifies cool / neutral / warm, muted-warm classifies olive",
    undertoneErrors.length === 0
      ? ""
      : undertoneErrors.map((x) => `${x.off}° wanted ${x.want} got ${x.got}`).join(", ")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Analysis pipeline and its gates
// ─────────────────────────────────────────────────────────────────────────────

function patch(
  region: SkinPatch["region"],
  hex: string,
  pixels = 900,
  sd = 3
): SkinPatch {
  const rgb = hexToRgb(hex)!;
  return { region, r: rgb.r, g: rgb.g, b: rgb.b, pixels, luminanceStdDev: sd };
}

function fivePatches(hex: string): SkinPatch[] {
  return [
    patch("forehead", hex),
    patch("left_cheek", hex),
    patch("right_cheek", hex),
    patch("jaw", hex),
    patch("nose_bridge", hex),
  ];
}

/** Neutral light: a grey illuminant estimate that needs no correction. */
const NEUTRAL_LIGHT = { r: 200, g: 200, b: 200 };

/**
 * A literature-typical complexion at a given lightness — the reference hue and
 * chroma for that L*, converted back to sRGB.
 *
 * These are the right probes for asking what the catalog can offer, because they
 * are the colours real faces actually cluster around. The Monk swatches span the
 * depth range but are yellow-shifted illustrative colours (see the measured table
 * above), so matching against them would exercise hues no face has.
 */
function typicalSkinAt(L: number): { hex: string; lab: Lab } {
  const ref = skinReference(L);
  const h = (ref.hue * Math.PI) / 180;
  const lab: Lab = {
    L,
    a: ref.chroma * Math.cos(h),
    b: ref.chroma * Math.sin(h),
  };
  return { hex: rgbToHex(labToRgb(lab)), lab };
}

function verifyPipeline() {
  section("Analysis pipeline");

  const clean = analyseSkin(fivePatches("#D9A77B"), NEUTRAL_LIGHT);
  record(
    clean.quality.ok && clean.skin?.hex.toUpperCase() === "#D9A77B"
      ? "pass"
      : "fail",
    "Neutral light leaves the measured colour untouched",
    `hex ${clean.skin?.hex}, ITA ${clean.skin?.ita}°, depth ${clean.skin?.depthLevel}, confidence ${clean.confidence.score} (${clean.confidence.label})`
  );

  // One bad patch out of five must not move the answer — that is why the
  // aggregate is a median and why outliers are dropped before the spread is
  // measured rather than counted as disagreement.
  const withOutlier = fivePatches("#D9A77B");
  withOutlier[3] = patch("jaw", "#5A3A20"); // a shadow under the jaw
  const robust = analyseSkin(withOutlier, NEUTRAL_LIGHT);
  const drift = robust.skin
    ? deltaE2000(robust.skin.lab, clean.skin!.lab)
    : Number.NaN;
  record(
    Number.isFinite(drift) && drift < 0.5 ? "pass" : "fail",
    "A single outlier patch is dropped, not allowed to force a retake",
    Number.isFinite(drift)
      ? `Colour shifted ΔE ${drift.toFixed(4)}; used ${robust.skin?.regionsUsed.length} regions; ` +
        `confidence ${clean.confidence.score} → ${robust.confidence.score}. ${robust.quality.warnings.join(" ")}`
      : `Wrongly rejected: ${robust.quality.retakeReason}`
  );

  // Two outliers out of five leaves exactly the minimum three good regions. The
  // reading may stand, but it must not stand silently.
  const twoBad = fivePatches("#D9A77B");
  twoBad[3] = patch("jaw", "#5A3A20");
  twoBad[4] = patch("nose_bridge", "#5A3A20");
  const strained = analyseSkin(twoBad, NEUTRAL_LIGHT);
  record(
    strained.quality.ok === false || strained.quality.warnings.length > 0
      ? "pass"
      : "fail",
    "Two outliers out of five are reported, not absorbed silently",
    strained.quality.ok
      ? `Warned: ${strained.quality.warnings.join(" ")} (confidence ${strained.confidence.score})`
      : `Retake demanded: ${strained.quality.retakeReason}`
  );

  // Genuinely uneven lighting — a gradient across the face rather than one bad
  // region — has no majority to fall back on and must be refused.
  const gradient: SkinPatch[] = [
    patch("forehead", "#EFC9A6"),
    patch("left_cheek", "#E3B891"),
    patch("right_cheek", "#B98C63"),
    patch("jaw", "#9A6E48"),
    patch("nose_bridge", "#D9A77B"),
  ];
  const uneven = analyseSkin(gradient, NEUTRAL_LIGHT);
  record(
    !uneven.quality.ok || uneven.quality.warnings.length > 0 ? "pass" : "fail",
    "A lighting gradient across the face is caught",
    uneven.quality.ok
      ? `Warned: ${uneven.quality.warnings.join(" ")}`
      : `Retake demanded: ${uneven.quality.retakeReason}`
  );

  section("Deep skin is not mistaken for a dark photo");

  // The regression test for the bug this pipeline shipped with first: a flat
  // lightness floor rejected the deepest Monk swatch outright, telling those
  // users to retake a perfectly good photo.
  for (const [label, hex] of [
    ["Monk 9", MONK_SWATCHES[8]],
    ["Monk 10", MONK_SWATCHES[9]],
    ["Literature-typical deep skin", typicalSkinAt(30).hex],
  ] as [string, string][]) {
    const deep = analyseSkin(fivePatches(hex), NEUTRAL_LIGHT);
    record(
      deep.quality.ok && deep.skin !== null ? "pass" : "fail",
      `${label} (${hex}) in good light is accepted`,
      deep.skin
        ? `ITA ${deep.skin.ita}°, depth ${deep.skin.depthLevel}, undertone ${deep.skin.undertone}, Monk ${deep.skin.monkScale}, confidence ${deep.confidence.score}`
        : `Wrongly rejected: ${deep.quality.retakeReason}`
    );
  }

  // The same deep complexion in a genuinely dark room must be refused — the
  // distinction has to come from the light, not from the skin.
  const darkRoom = analyseSkin(fivePatches(MONK_SWATCHES[9]), { r: 42, g: 40, b: 38 });
  record(
    !darkRoom.quality.ok ? "pass" : "fail",
    "The same deep complexion photographed in the dark is refused",
    darkRoom.quality.ok
      ? "Accepted, so underexposure is not being detected."
      : `“${darkRoom.quality.retakeReason}”`
  );

  section("Quality gates (the retake path)");

  const gates: [string, ReturnType<typeof analyseSkin>][] = [
    ["Underexposed frame", analyseSkin(fivePatches("#1A1210"), { r: 38, g: 36, b: 34 })],
    ["Blown out", analyseSkin(fivePatches("#FCFAF8"), NEUTRAL_LIGHT)],
    ["Strong orange light", analyseSkin(fivePatches("#D9A77B"), { r: 210, g: 120, b: 60 })],
    [
      "Too few readable regions",
      analyseSkin([patch("forehead", "#D9A77B"), patch("jaw", "#D9A77B")], NEUTRAL_LIGHT),
    ],
    [
      "Every region textured",
      analyseSkin(
        fivePatches("#D9A77B").map((p) => ({ ...p, luminanceStdDev: 30 })),
        NEUTRAL_LIGHT
      ),
    ],
    [
      "Patches with almost no accepted pixels",
      analyseSkin(
        fivePatches("#D9A77B").map((p) => ({ ...p, pixels: 5 })),
        NEUTRAL_LIGHT
      ),
    ],
  ];

  for (const [label, result] of gates) {
    record(
      result.quality.ok === false && result.skin === null ? "pass" : "fail",
      `${label} → retake demanded`,
      result.quality.ok
        ? "Accepted, which it should not have been."
        : `“${result.quality.retakeReason}” / ${result.quality.retakeHint}`
    );
  }

  // A mild cast is correctable, and must be corrected rather than refused.
  const mild = analyseSkin(fivePatches("#E0B48C"), { r: 190, g: 174, b: 158 });
  record(
    mild.quality.ok ? "pass" : "fail",
    "A mildly warm room is corrected, not rejected",
    mild.quality.ok
      ? `hex ${mild.skin?.hex}, gains ${JSON.stringify(mild.skin?.whiteBalanceGains)}, confidence ${mild.confidence.score}` +
        (mild.quality.warnings.length ? ` — ${mild.quality.warnings.join(" ")}` : "")
      : `Rejected: ${mild.quality.retakeReason}`
  );

  // Missing illuminant is allowed but must cap confidence — an uncorrected
  // reading that claims high confidence is the exact failure the spec warned of.
  const noWb = analyseSkin(fivePatches("#D9A77B"), null);
  record(
    noWb.quality.ok && noWb.confidence.score <= 0.5 ? "pass" : "fail",
    "No lighting reference → reading allowed, confidence capped at 0.5",
    `confidence ${noWb.confidence.score} (${noWb.confidence.label}); ${noWb.quality.warnings.join(" ")}`
  );

  section("Wire validation");

  const badInputs: [string, unknown][] = [
    ["not an array", { forehead: "#fff" }],
    ["empty array", []],
    ["unknown region", [{ region: "elbow", r: 1, g: 1, b: 1, pixels: 9, luminanceStdDev: 1 }]],
    [
      "duplicate region",
      [
        { region: "jaw", r: 1, g: 1, b: 1, pixels: 9, luminanceStdDev: 1 },
        { region: "jaw", r: 1, g: 1, b: 1, pixels: 9, luminanceStdDev: 1 },
      ],
    ],
    ["channel out of range", [{ region: "jaw", r: 300, g: 1, b: 1, pixels: 9, luminanceStdDev: 1 }]],
    ["NaN channel", [{ region: "jaw", r: Number.NaN, g: 1, b: 1, pixels: 9, luminanceStdDev: 1 }]],
    ["negative pixels", [{ region: "jaw", r: 1, g: 1, b: 1, pixels: -5, luminanceStdDev: 1 }]],
    [
      "too many patches",
      Array.from({ length: 11 }, () => ({
        region: "jaw",
        r: 1,
        g: 1,
        b: 1,
        pixels: 9,
        luminanceStdDev: 1,
      })),
    ],
  ];
  const accepted = badInputs.filter(([, input]) => !("error" in parsePatches(input)));
  record(
    accepted.length === 0 ? "pass" : "fail",
    `All ${badInputs.length} malformed patch payloads rejected with a reason`,
    accepted.length === 0
      ? ""
      : `Wrongly accepted: ${accepted.map(([l]) => l).join(", ")}`
  );

  const goodPatches = parsePatches(
    fivePatches("#D9A77B").map((p) => ({ ...p }))
  );
  record(
    "patches" in goodPatches && goodPatches.patches.length === 5 ? "pass" : "fail",
    "A well-formed patch payload is accepted"
  );

  const illuminants: [string, unknown, boolean][] = [
    ["absent", undefined, true],
    ["null", null, true],
    ["valid", { r: 128, g: 130, b: 126 }, true],
    ["black", { r: 0, g: 0, b: 0 }, false],
    ["out of range", { r: 999, g: 1, b: 1 }, false],
    ["missing channel", { r: 128, g: 128 }, false],
  ];
  const illErrors = illuminants.filter(
    ([, input, shouldPass]) => !("error" in parseIlluminant(input)) !== shouldPass
  );
  record(
    illErrors.length === 0 ? "pass" : "fail",
    "Illuminant validation accepts absent/valid and rejects black/out-of-range",
    illErrors.length === 0 ? "" : `Wrong for: ${illErrors.map(([l]) => l).join(", ")}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The real catalog
// ─────────────────────────────────────────────────────────────────────────────

async function verifyCatalog() {
  section("Live catalog");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    record("skip", "Supabase env vars not set — catalog checks skipped");
    return;
  }

  const supabase = createClient(url, key);

  const { data: shades, error: shadeError } = await supabase
    .from("product_shades")
    .select("product_key, shade_key, shade_name, shade_hex, shade_order, undertone")
    .like("product_key", "fnd_%");

  if (shadeError || !shades) {
    record("fail", "Could not read product_shades", shadeError?.message ?? "no rows");
    return;
  }

  const { data: products, error: productError } = await supabase
    .from("makeup_products")
    .select("product_key, name, brand, price, image_url, finish, coverage, is_active")
    .like("product_key", "fnd_%");

  if (productError || !products) {
    record("fail", "Could not read makeup_products", productError?.message ?? "no rows");
    return;
  }

  record(
    shades.length > 0 ? "pass" : "fail",
    `Read ${shades.length} fnd_* shade rows across ${products.length} products`
  );

  const missingHex = shades.filter((s) => !hexToLab((s as ShadeRow).shade_hex)).length;
  record(
    missingHex === 0 ? "pass" : "warn",
    `${shades.length - missingHex} of ${shades.length} shade rows have a parseable shade_hex`,
    missingHex === 0
      ? ""
      : `${missingHex} rows have a null or malformed hex and are dropped from ranking rather than matched as black.`
  );

  // Match six literature-typical complexions spanning the range. Not the Monk
  // swatches: those are yellow-shifted illustrative colours (measured above), so
  // matching against them would exercise hues no real face has and would make
  // the catalog look either better or worse than it is for no honest reason.
  section("End-to-end match across the skin range");

  const probes = [82, 72, 62, 52, 42, 32].map((L) => {
    const t = typicalSkinAt(L);
    return { label: `L* ${L}`, hex: t.hex };
  });

  let allRanked = true;
  let worstBest = 0;

  for (const probe of probes) {
    const analysis = analyseSkin(fivePatches(probe.hex), NEUTRAL_LIGHT);
    if (!analysis.skin) {
      record("fail", `${probe.label} (${probe.hex}) could not be analysed`, analysis.quality.retakeReason ?? "");
      allRanked = false;
      continue;
    }

    const ranked = rankFoundationShades(
      shades as ShadeRow[],
      products as ProductRow[],
      {
        skinLab: analysis.skin.lab,
        undertone: analysis.skin.undertone,
        limit: 3,
      }
    );

    if (ranked.matches.length === 0) {
      record("fail", `${probe.label} produced no matches`);
      allRanked = false;
      continue;
    }

    const best = ranked.matches[0];
    if (best.deltaE > worstBest) worstBest = best.deltaE;

    console.log(
      `  \x1b[1m${probe.label}\x1b[0m ${probe.hex} → ITA ${analysis.skin.ita}°, ` +
        `${analysis.skin.depthLevel}, ${analysis.skin.undertone}, Monk ${analysis.skin.monkScale}`
    );
    for (const m of ranked.matches) {
      note(
        `  #${m.rank} ${m.shadeName} ${m.shadeHex} ΔE ${m.deltaE.toFixed(2)} ` +
          `(${m.quality}) — ${m.brand ?? "?"} ${m.productName}` +
          (m.alsoAvailableFrom.length
            ? ` +${m.alsoAvailableFrom.length} other product${m.alsoAvailableFrom.length === 1 ? "" : "s"}`
            : "")
      );
    }
    if (ranked.lighterAlternate) {
      note(`  lighter: ${ranked.lighterAlternate.shadeName} ΔL ${ranked.lighterAlternate.deltaL.toFixed(1)}`);
    }
    if (ranked.deeperAlternate) {
      note(`  deeper:  ${ranked.deeperAlternate.shadeName} ΔL ${ranked.deeperAlternate.deltaL.toFixed(1)}`);
    }
    note(`  reason: ${best.reason}`);
  }

  if (allRanked) {
    record(
      worstBest < 12 ? "pass" : "warn",
      "Every complexion across the range gets a ranked match",
      `Worst best-match distance ΔE ${worstBest.toFixed(2)}.` +
        (worstBest >= 12
          ? " Above ~10 the closest shade is visibly off, which means a gap in the catalog rather than a bug in the matcher."
          : "")
    );
  }

  // The honest diagnostics, printed once from a mid-range probe.
  section("What the catalog can actually discriminate");
  const mid = analyseSkin(fivePatches(typicalSkinAt(62).hex), NEUTRAL_LIGHT);
  const diag = rankFoundationShades(shades as ShadeRow[], products as ProductRow[], {
    skinLab: mid.skin!.lab,
    undertone: mid.skin!.undertone,
  }).diagnostics;

  note(`${diag.shadeRowsConsidered} rows → ${diag.distinctColours} distinct colours`);
  note(
    `L* ${diag.lightnessRange.min.toFixed(1)}–${diag.lightnessRange.max.toFixed(1)} ` +
      `(span ${diag.lightnessRange.span.toFixed(1)})`
  );
  note(`hue span ${diag.hueSpanDegrees.toFixed(1)}° overall, ${diag.localHueSpanDegrees.toFixed(1)}° near this depth`);
  note(`undertone weight ${diag.undertoneWeight.toFixed(2)} (0 = cannot discriminate)`);
  for (const n of diag.notes) note(`• ${n}`);

  record(
    diag.lightnessRange.span > 40 ? "pass" : "warn",
    "Depth coverage is wide enough to match on lightness",
    `L* span ${diag.lightnessRange.span.toFixed(1)} across ${diag.distinctColours} colours.`
  );
  record(
    diag.undertoneWeight > 0.3 ? "pass" : "warn",
    diag.undertoneWeight > 0.3
      ? "Catalog has enough hue variety for undertone to affect ranking"
      : "Catalog cannot discriminate undertone — ranking is depth-only, by design",
    diag.undertoneWeight > 0.3
      ? ""
      : "The undertone penalty self-disables and the reason strings omit any undertone claim. " +
        "To make undertone ranking real, add cool/neutral/olive hexes at the *same* depths."
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1mFoundation shade-match verification\x1b[0m");

  verifyDeltaE2000();
  verifyConversions();
  verifyPipeline();
  await verifyCatalog();

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  console.log(
    `\n\x1b[1m${passed} passed, ${failed} failed, ${warned} warnings, ${skipped} skipped\x1b[0m`
  );

  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => x.status === "fail")) {
      console.log(`  ${ICON.fail} ${r.title}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\x1b[31mVerification crashed\x1b[0m", err);
  process.exit(1);
});
