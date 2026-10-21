import assert from "node:assert/strict";
import { calculateMatchScore } from "../src/lib/skin-analysis/scoring";
import { normalizeConcernScores } from "../src/lib/skin-analysis/contract";
import { mapFaceppSkinResult } from "../src/lib/skin-analysis/facepp-mapper";
import { buildDeterministicRoutine, isProductSafe } from "../src/lib/skin-analysis/deterministic-routine";
import { normalizeCatalogProduct } from "../src/lib/skin-analysis/product-shape";
import type { Product } from "../src/lib/skin-analysis/recommend";

function product(partial: Partial<Product> & Pick<Product, "id" | "category">): Product {
  return {
    name: partial.name ?? partial.id,
    brand: "Test",
    price: 10,
    image_url: "",
    skin_type: partial.skin_type ?? ["Oily"],
    tags: partial.tags ?? [],
    ingredients: partial.ingredients ?? "",
    am_safe: partial.am_safe ?? true,
    pm_safe: partial.pm_safe ?? true,
    ...partial,
  };
}

const legacyQuestionnaire = normalizeConcernScores(
  {
    main_concerns: ["acne", "dark spots"],
    severity_scores: { acne: 0.8, "dark spots": 0.4 },
  },
  "questionnaire",
);
assert.equal(legacyQuestionnaire.version, 2);
assert.equal(legacyQuestionnaire.concerns.find((c) => c.tag === "acne")?.severity, 0.8);
assert.ok(!legacyQuestionnaire.concerns.some((c) => c.tag === ("Daily Care" as never)));

const legacyPhoto = normalizeConcernScores(
  { main_concerns: ["acne", "hyperpigmentation"], heuristics: { overallScore: 72 } },
  "photo",
);
assert.equal(legacyPhoto.concerns.some((c) => c.tag === "dark spots"), true);
assert.equal(legacyPhoto.heuristics?.overallScore, 72);

const nested = calculateMatchScore(
  product({
    id: "p1",
    category: "Treatment",
    tags: ["acne", "oil-free"],
    skin_type: ["Oily"],
  }),
  "Oily",
  {
    main_concerns: ["acne"],
    severity_scores: { acne: 0.9 },
  } as never,
);
assert.ok(nested.matchScore > 40);
assert.equal(Number.isFinite(nested.matchScore), true);

const garbage = calculateMatchScore(
  product({ id: "p2", category: "Cleanser", tags: ["acne"], skin_type: ["Dry"] }),
  "Dry",
  { main_concerns: ["acne"], severity_scores: { acne: 0.5 } } as never,
);
assert.equal(Number.isFinite(garbage.matchScore), true);

const face = mapFaceppSkinResult(
  {
    skin_type: { skin_type: 0 },
    acne: { value: 1, confidence: 0.9 },
    skin_spot: { value: 1, confidence: 0.8 },
  },
  20,
);
assert.equal(face.skinType, "Oily");
assert.equal(face.concerns.some((c) => c.tag === "acne"), true);
assert.equal(face.concerns.some((c) => c.tag === "dark spots"), true);
assert.equal(face.concerns.some((c) => c.tag === ("Cleanser" as never)), false);

const normal = mapFaceppSkinResult({ skin_type: { skin_type: 2 } }, 10);
assert.equal(normal.needsSkinTypeConfirmation, true);
assert.equal(normal.confidence, "low");

const retinoid = product({
  id: "ret",
  category: "Treatment",
  ingredients: "retinol, glycerin",
  am_safe: false,
  pm_safe: true,
});
assert.equal(isProductSafe(retinoid, { pregnant: true }), false);
assert.equal(isProductSafe(retinoid, { allergies: ["fragrance"] }), true);

const routine = buildDeterministicRoutine(
  [
    product({ id: "c", category: "Cleanser", tags: ["acne"], skin_type: ["Oily"], ingredients: "water" }),
    product({ id: "bad", category: "Treatment", tags: ["acne"], skin_type: ["Oily"], ingredients: "retinol" }),
    product({ id: "good", category: "Treatment", tags: ["acne", "oil-free"], skin_type: ["Oily"], ingredients: "niacinamide" }),
    product({ id: "m", category: "Moisturizer", tags: ["oil-free"], skin_type: ["Oily"], ingredients: "glycerin" }),
  ],
  "Oily",
  { acne: 0.9 },
  { pregnant: true, skinType: "Oily" },
);
assert.equal(routine.amRoutine.some((item) => item.id === "bad"), false);
assert.equal(routine.amRoutine.some((item) => item.id === "good"), true);
assert.equal(routine.source, "rules");

const stringTags = product({
  id: "csv",
  category: "Cleanser",
  tags: "{acne,fragrance}" as never,
  ingredients: "water",
});
assert.equal(isProductSafe(stringTags, { allergies: ["fragrance"] }), false);

const catalog = normalizeCatalogProduct({
  id: "db-1",
  name: "Gel Cleanser",
  brand: "Lab",
  category: "cleanser",
  tags: "{acne,oil-free}",
  skin_type: "Oily",
  am_safe: null,
  pm_safe: null,
});
assert.equal(catalog?.category, "Cleanser");
assert.deepEqual(catalog?.tags, ["acne", "oil-free"]);
assert.equal(catalog?.am_safe, true);

const fromCatalog = buildDeterministicRoutine(
  [catalog!],
  "Oily",
  { acne: 0.8 },
  { skinType: "Oily" },
);
assert.equal(fromCatalog.amRoutine.some((item) => item.id === "db-1"), true);

console.log("skin-analysis unit checks passed");
