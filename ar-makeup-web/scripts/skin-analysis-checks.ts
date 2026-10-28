import assert from "node:assert/strict";
import { calculateMatchScore } from "../src/lib/skin-analysis/scoring";
import { normalizeConcernScores } from "../src/lib/skin-analysis/contract";
import { mapFaceppSkinResult } from "../src/lib/skin-analysis/facepp-mapper";
import { getTopCandidates } from "../src/lib/skin-analysis/candidate-selector";
import { buildDeterministicRoutine, isProductSafe } from "../src/lib/skin-analysis/deterministic-routine";
import { buildGroqRoutineMessages, estimateGroqTokens } from "../src/lib/skin-analysis/groq-payload";
import { normalizeCatalogProduct } from "../src/lib/skin-analysis/product-shape";
import { generateFinalRoutine } from "../src/lib/skin-analysis/ai-engine";
import { CHAT_FAILURE_MESSAGE, friendlyChatError } from "../src/lib/chat/public-error";
import type { ExactCategory, Product } from "../src/lib/skin-analysis/recommend";

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

const ingredientBlob = "aqua, glycerin, niacinamide, ".repeat(800);
const steps: ExactCategory[] = ["Cleanser", "Treatment", "Eye cream", "Moisturizer", "sunscreen"];
const bloated: Product[] = [];
for (const category of steps) {
  for (let i = 0; i < 3; i++) {
    bloated.push(
      product({
        id: `${category}-${i}`,
        name: `${category} option ${i}`,
        category,
        tags: ["acne", "oil-free", "soothing"],
        skin_type: ["Oily"],
        ingredients: ingredientBlob,
      }),
    );
  }
}
const shortlist = getTopCandidates(bloated, "Oily", { acne: 0.9 }, 3);
const groq = buildGroqRoutineMessages({
  skinType: "Oily",
  concerns: { acne: 0.9 },
  am: shortlist.amCandidates,
  pm: shortlist.pmCandidates,
});
assert.ok(estimateGroqTokens(groq) < 6000);
assert.equal(groq.user.includes("niacinamide"), false);
assert.equal(groq.user.includes("ingredients"), false);
const packed = JSON.parse(groq.user.slice("JSON: ".length)) as {
  am: Record<string, { key: string; name: string; category: string; reason: string }[]>;
  pm: Record<string, { key: string }[]>;
};
assert.equal(packed.pm.sunscreen, undefined);
assert.equal(Object.keys(packed.pm).length, 4);
for (const step of steps) {
  assert.equal(packed.am[step].length, 1);
  assert.deepEqual(Object.keys(packed.am[step][0]).sort(), ["category", "key", "name", "reason"]);
  assert.equal(packed.am[step][0].key, `${step}-0`);
}
assert.ok(packed.am.Cleanser[0].reason.length <= 72);

void (async () => {
  const catalog = [
    product({ id: "c", category: "Cleanser", tags: ["acne"], skin_type: ["Oily"], ingredients: "water" }),
    product({ id: "t", category: "Treatment", tags: ["acne"], skin_type: ["Oily"], ingredients: "niacinamide" }),
    product({ id: "m", category: "Moisturizer", tags: ["oil-free"], skin_type: ["Oily"], ingredients: "glycerin" }),
  ];

  let geminiCalls = 0;
  const busy = await generateFinalRoutine(catalog, "Oily", { acne: 0.9 }, { skinType: "Oily" }, {
    gemini: async () => {
      geminiCalls += 1;
      throw Object.assign(new Error("503 Service Unavailable"), { status: 503 });
    },
    groq: async () => {
      throw Object.assign(
        new Error('413 {"error":{"message":"Request too large"}} ApiError limit reached'),
        { status: 413 },
      );
    },
  });
  assert.equal(geminiCalls, 2);
  assert.equal(busy.source, "rules");
  assert.ok(busy.amRoutine.length > 0);
  assert.equal(busy.amRoutine.some((item) => item.id === "c"), true);

  let quotaCalls = 0;
  const emptyThenRules = await generateFinalRoutine(
    catalog,
    "Oily",
    { acne: 0.9 },
    { skinType: "Oily" },
    {
      gemini: async () => {
        quotaCalls += 1;
        throw Object.assign(new Error("429 limit reached"), { status: 429 });
      },
      groq: async () => ({}),
    },
  );
  assert.equal(quotaCalls, 1);
  assert.equal(emptyThenRules.source, "rules");
  assert.ok(emptyThenRules.amRoutine.length > 0);

  const leaked = [
    new Error("ApiError: 429 limit reached\n    at Groq (node_modules/groq/index.js:10:1)"),
    { status: 413, message: '{"error":{"message":"Request too large"}}' },
    "503 Service Unavailable",
  ];
  for (const sample of leaked) {
    const text = friendlyChatError(sample);
    assert.equal(text, CHAT_FAILURE_MESSAGE);
    assert.equal(/apierror|429|413|503|limit reached|groq|node_modules/i.test(text), false);
  }

  console.log("skin-analysis unit checks passed");
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "check failed";
  console.error(message);
  process.exit(1);
});
