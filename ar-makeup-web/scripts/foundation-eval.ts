/**
 * Prints what the matcher measures for a file of on-device samples.
 *
 *     npx ts-node --project scripts/tsconfig.json scripts/foundation-eval.ts
 *     npx ts-node --project scripts/tsconfig.json scripts/foundation-eval.ts path/to/samples.json
 *
 * Each sample is `{ id, patches, illuminant?, whiteReference?, referenceLab? }`.
 * referenceLab is optional ground truth from a later capture session. Without it
 * the script still prints measured Lab, mapped Lab, and the top shade name when
 * the catalog can be read. No photos are read or stored.
 *
 * The bundled samples are synthetic. Real faces have to be captured in the app
 * (debug share on the match screen) and dropped in here.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { deltaE2000, type Lab } from "../src/lib/foundation/color";
import {
  analyseSkin,
  parseIlluminant,
  parsePatches,
  parseWhiteReference,
} from "../src/lib/foundation/analyze";
import { mapSkinToSwatch, SWATCH_MAP_VERSION } from "../src/lib/foundation/swatch-map";
import { rankFoundationShades, type ProductRow, type ShadeRow } from "../src/lib/foundation/match";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

type Sample = {
  id?: string;
  patches: unknown;
  illuminant?: unknown;
  whiteReference?: unknown;
  referenceLab?: { L: number; a: number; b: number };
};

function asLab(value: Sample["referenceLab"]): Lab | null {
  if (!value) return null;
  if (![value.L, value.a, value.b].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  return { L: value.L, a: value.a, b: value.b };
}

async function main() {
  const file =
    process.argv[2] ?? path.resolve(process.cwd(), "scripts/foundation-eval-samples.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { samples?: Sample[] } | Sample[];
  const samples = Array.isArray(raw) ? raw : raw.samples ?? [];
  if (samples.length === 0) {
    console.error(`No samples in ${file}`);
    process.exit(1);
  }

  console.log(`Swatch map ${SWATCH_MAP_VERSION}`);
  console.log(`Samples: ${path.basename(file)} (${samples.length})`);
  console.log(
    "Ground truth is optional. Synthetic rows are not a claim about real faces.\n"
  );

  let shades: ShadeRow[] = [];
  let products: ProductRow[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createClient(url, key);
    const shadeRes = await supabase
      .from("product_shades")
      .select("product_key, shade_key, shade_name, shade_hex, shade_order, undertone, match_hex")
      .like("product_key", "fnd_%");
    const shadeRows = shadeRes.error
      ? await supabase
          .from("product_shades")
          .select("product_key, shade_key, shade_name, shade_hex, shade_order, undertone")
          .like("product_key", "fnd_%")
      : shadeRes;
    const productRes = await supabase
      .from("makeup_products")
      .select("product_key, name, brand, price, image_url, finish, coverage, is_active")
      .like("product_key", "fnd_%");
    if (!shadeRows.error && !productRes.error) {
      shades = (shadeRows.data ?? []) as ShadeRow[];
      products = (productRes.data ?? []) as ProductRow[];
    } else {
      console.log("Catalog unreadable — printing Lab only.\n");
    }
  } else {
    console.log("No Supabase env — printing Lab only. Top shade needs the catalog.\n");
  }

  for (const [index, sample] of samples.entries()) {
    const id = sample.id ?? `sample-${index + 1}`;
    const patches = parsePatches(sample.patches);
    if ("error" in patches) {
      console.log(`${id}: skipped — ${patches.error}`);
      continue;
    }
    const illuminant = parseIlluminant(sample.illuminant ?? null);
    if ("error" in illuminant) {
      console.log(`${id}: skipped — ${illuminant.error}`);
      continue;
    }
    const paper = parseWhiteReference(sample.whiteReference);
    if ("error" in paper) {
      console.log(`${id}: skipped — ${paper.error}`);
      continue;
    }

    const analysis = analyseSkin(patches.patches, illuminant.illuminant, undefined, {
      whiteReference: paper.whiteReference,
    });
    if (!analysis.skin) {
      console.log(`${id}: retake — ${analysis.quality.retakeReason}`);
      if (analysis.quality.retakeHint) console.log(`  ${analysis.quality.retakeHint}`);
      continue;
    }

    const mapped = mapSkinToSwatch(analysis.skin.lab);
    const truth = asLab(sample.referenceLab);
    console.log(
      `${id}: measured L* ${analysis.skin.lab.L.toFixed(1)} a* ${analysis.skin.lab.a.toFixed(1)} b* ${analysis.skin.lab.b.toFixed(1)}` +
        `  →  mapped L* ${mapped.L.toFixed(1)} a* ${mapped.a.toFixed(1)} b* ${mapped.b.toFixed(1)}` +
        `  (${analysis.calibration}, confidence ${analysis.confidence.score})`
    );
    if (truth) {
      const dE = deltaE2000(analysis.skin.lab, truth);
      const dL = analysis.skin.lab.L - truth.L;
      console.log(
        `  vs reference: ΔE ${dE.toFixed(2)}, ΔL ${dL >= 0 ? "+" : ""}${dL.toFixed(2)} (measured minus reference)`
      );
    } else {
      console.log("  no reference Lab — capture a known sample later to score ΔE / ΔL");
    }

    if (shades.length > 0) {
      const ranked = rankFoundationShades(shades, products, {
        skinLab: mapped,
        undertone: analysis.skin.undertone,
        limit: 1,
        confidenceLabel: analysis.confidence.label,
      });
      const top = ranked.matches[0];
      if (top) {
        console.log(
          `  top shade: ${top.shadeName} ${top.shadeHex} ΔE ${top.deltaE.toFixed(2)} (${top.brand ?? ""} ${top.productName})`
        );
      } else {
        console.log("  top shade: none");
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
