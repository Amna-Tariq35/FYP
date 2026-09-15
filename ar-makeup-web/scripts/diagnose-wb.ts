/* Throwaway diagnostic: reproduce the reported #968A82 / C* 6.5 measurement. */
import { rgbToLab, rgbToHex, chroma, hueAngle, itaDegrees, deltaE2000 } from "../src/lib/foundation/color";
import { whiteBalanceGains } from "../src/lib/foundation/analyze";

const reported = { r: 0x96, g: 0x8a, b: 0x82 };
const lab = rgbToLab(reported);
console.log("REPORTED #968A82 →", {
  L: lab.L.toFixed(1), a: lab.a.toFixed(1), b: lab.b.toFixed(1),
  C: chroma(lab).toFixed(1), hue: hueAngle(lab).toFixed(1), ita: itaDegrees(lab).toFixed(1),
});

// Plausible real complexions (medium-light South Asian range) under neutral light.
const truths = [
  { name: "light",  rgb: { r: 226, g: 194, b: 172 } },
  { name: "medium", rgb: { r: 198, g: 162, b: 138 } },
  { name: "tan",    rgb: { r: 170, g: 132, b: 106 } },
];
for (const t of truths) {
  const l = rgbToLab(t.rgb);
  console.log(`TRUTH ${t.name.padEnd(7)} ${rgbToHex(t.rgb)} L*${l.L.toFixed(1)} a*${l.a.toFixed(1)} b*${l.b.toFixed(1)} C*${chroma(l).toFixed(1)} h${hueAngle(l).toFixed(0)}`);
}

console.log("\n--- Whole-frame gray-world when the FACE dominates the frame ---");
// p=6 Minkowski over a frame that is mostly skin -> illuminant ≈ skin, slightly
// pulled toward the brightest skin pixels. Model: illuminant = skin * k, k>1.
for (const t of truths) {
  for (const k of [1.05, 1.15, 1.25]) {
    const illum = { r: Math.min(255, t.rgb.r * k), g: Math.min(255, t.rgb.g * k), b: Math.min(255, t.rgb.b * k) };
    const { gains, cast } = whiteBalanceGains(illum);
    const out = {
      r: Math.min(255, t.rgb.r * gains.r),
      g: Math.min(255, t.rgb.g * gains.g),
      b: Math.min(255, t.rgb.b * gains.b),
    };
    const ol = rgbToLab(out);
    console.log(
      `${t.name.padEnd(7)} k=${k}  cast=${cast.toFixed(2)}  →  ${rgbToHex(out)} ` +
      `L*${ol.L.toFixed(1)} a*${ol.a.toFixed(1)} b*${ol.b.toFixed(1)} C*${chroma(ol).toFixed(1)} ` +
      `h${hueAngle(ol).toFixed(0)}  ΔE(vs #968A82)=${deltaE2000(ol, lab).toFixed(1)}`
    );
  }
}

console.log("\n--- What the cast gate sees ---");
console.log("WARN_ILLUMINANT_CAST = 1.30, MAX_ILLUMINANT_CAST = 1.75");
console.log("i.e. a cast of ~1.2 passes silently while destroying ~2/3 of skin chroma.");

console.log("\n--- Catalog reachability from a CORRECT vs BROKEN measurement ---");
const golden = rgbToLab({ r: 0xc1, g: 0x8e, b: 0x69 });
console.log("Golden Beige #C18E69 →", { L: golden.L.toFixed(1), a: golden.a.toFixed(1), b: golden.b.toFixed(1), C: chroma(golden).toFixed(1) });
console.log("ΔE broken (#968A82 → Golden Beige):", deltaE2000(lab, golden).toFixed(1));
for (const t of truths) {
  console.log(`ΔE truth ${t.name.padEnd(7)} → Golden Beige:`, deltaE2000(rgbToLab(t.rgb), golden).toFixed(1));
}
