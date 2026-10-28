import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import { Product, ConcernScores, SkincareRoutine } from "./recommend";
import { getTopCandidates } from "./candidate-selector";
import { buildDeterministicRoutine, type SafetyContext } from "./deterministic-routine";
import { buildGroqRoutineMessages } from "./groq-payload";

// Schema for response validation
const routineResponseSchema = {
  type: Type.OBJECT,
  properties: {
    // [NEW]: Add aiSummary to the expected AI JSON output
    aiSummary: { 
      type: Type.STRING,
      description: "A 2-3 sentence professional and empathetic summary of the user's skin profile and how this routine helps."
    },
    amRoutine: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          matchReason: { type: Type.STRING },
          matchScore: { type: Type.INTEGER },
        },
        required: ["id", "matchReason", "matchScore"],
      },
    },
    pmRoutine: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          matchReason: { type: Type.STRING },
          matchScore: { type: Type.INTEGER },
        },
        required: ["id", "matchReason", "matchScore"],
      },
    },
  },
  required: ["aiSummary", "amRoutine", "pmRoutine"], // Ensure aiSummary is required
};

function providerFailure(error: unknown) {
  const record = error as { status?: unknown; statusCode?: unknown };
  const status =
    typeof record?.status === "number"
      ? record.status
      : typeof record?.statusCode === "number"
        ? record.statusCode
        : undefined;
  const raw = error instanceof Error ? error.message : "request failed";
  const message = raw
    .replace(/key=[^&\s]+/gi, "key=redacted")
    .replace(/Bearer\s+\S+/gi, "Bearer redacted")
    .slice(0, 240);
  return { status, message };
}

function isGeminiBusy(error: unknown) {
  const failure = providerFailure(error);
  if (failure.status === 503) return true;
  return /\b503\b/.test(failure.message);
}

type ModelRoutine = {
  aiSummary?: string;
  amRoutine?: { id: string; matchReason: string; matchScore?: number }[];
  pmRoutine?: { id: string; matchReason: string; matchScore?: number }[];
};

function readRoutinePayload(value: unknown): ModelRoutine | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as ModelRoutine;
  const hasSteps =
    (Array.isArray(record.amRoutine) && record.amRoutine.length > 0) ||
    (Array.isArray(record.pmRoutine) && record.pmRoutine.length > 0);
  return hasSteps ? record : null;
}

async function geminiRoutine(call: () => Promise<unknown>) {
  try {
    const first = readRoutinePayload(await call());
    if (first) return first;
    console.warn("Gemini routine was empty. Trying the next provider.");
    return null;
  } catch (error) {
    const failure = providerFailure(error);
    console.warn("Gemini routine failed", failure.status ?? "");
    if (!isGeminiBusy(error)) return null;
    try {
      const second = readRoutinePayload(await call());
      if (second) return second;
      console.warn("Gemini retry was empty. Trying the next provider.");
      return null;
    } catch (retryError) {
      const retry = providerFailure(retryError);
      console.warn("Gemini retry failed", retry.status ?? "");
      return null;
    }
  }
}

export async function generateFinalRoutine(
  allDbProducts: Product[],
  userSkinType: string,
  // [UPDATED] Must accept Array as well for Photo Route compatibility
  concernScores: ConcernScores | string[],
  safety: SafetyContext = {},
  models?: {
    gemini?: () => Promise<unknown>;
    groq?: () => Promise<unknown>;
  },
): Promise<SkincareRoutine & { summary: string; source: "ai" | "rules" | "mixed" }> { 
  // 1. Candidate selection (Token reduction)
  const candidates = getTopCandidates(allDbProducts, userSkinType, concernScores, 3);

  const productMap = new Map<string, any>();
  Object.values(candidates.amCandidates).flat().forEach((p) => productMap.set(p.id, p));
  Object.values(candidates.pmCandidates).flat().forEach((p) => productMap.set(p.id, p));

  const filterLight = (list: any[]) =>
    list.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      ingredients: p.ingredients,
      tags: p.tags,
      am_safe: p.am_safe,
      pm_safe: p.pm_safe,
    }));

  const lightweightAmCandidates: Record<string, any> = {};
  for (const [cat, items] of Object.entries(candidates.amCandidates)) {
    lightweightAmCandidates[cat] = filterLight(items as any[]);
  }

  const lightweightPmCandidates: Record<string, any> = {};
  for (const [cat, items] of Object.entries(candidates.pmCandidates)) {
    lightweightPmCandidates[cat] = filterLight(items as any[]);
  }

  const systemPrompt = `You are a skincare formulation assistant. Select an AM and PM routine strictly from the provided candidates based on the user's skin profile.

CRITICAL DIRECTIVES:
1. STRICT DATA TRUTH:
   - Base all reasoning ONLY on the provided skinType and concerns.
   - NEVER mention a concern that is not in the user's list.
   - This is product guidance, not a medical diagnosis.

2. CATEGORY EXCLUSIVITY:
   - Select EXACTLY 1 product per category:
     * AM: Cleanser -> Treatment -> Eye cream -> Moisturizer -> sunscreen
     * PM: Cleanser -> Treatment -> Eye cream -> Moisturizer
   - Use only product id strings from the candidates. Do not invent ids.

3. SAFETY:
   - AM items must be am_safe. PM items must be pm_safe.
   - Do not pair a retinoid with an AHA or BHA in the same routine.

4. REASONING:
   - matchReason: 1-2 sentences on why the product fits this profile.
   - matchScore: copy the candidate's existing score if present, otherwise use 80.

5. SUMMARY:
   - aiSummary: 2-3 plain sentences describing the profile and how the routine helps. Do not claim a clinical diagnosis.`;
   const userPayload = {
    userProfile: { skinType: userSkinType, concerns: concernScores },
    amCandidates: lightweightAmCandidates,
    pmCandidates: lightweightPmCandidates,
  };

  const rules = buildDeterministicRoutine(allDbProducts, userSkinType, concernScores, {
    ...safety,
    skinType: userSkinType,
  });

  const callGemini =
    models?.gemini ??
    (async () => {
      const skincareKey = process.env.GEMINI_API_KEY;
      if (!skincareKey) {
        throw new Error("Gemini key is not configured");
      }
      const ai = new GoogleGenAI({ apiKey: skincareKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: routineResponseSchema,
          temperature: 0.2,
          httpOptions: {
            retryOptions: { attempts: 1 },
          },
        },
      });
      return response.text || "";
    });

  const callGroq =
    models?.groq ??
    (async () => {
      const groqKey = process.env.GROQ_SKINCARE_API_KEY;
      if (!groqKey) {
        throw new Error("Groq key is not configured");
      }
      const groq = new Groq({ apiKey: groqKey, maxRetries: 0 });
      const groqMessages = buildGroqRoutineMessages({
        skinType: userSkinType,
        concerns: concernScores,
        am: lightweightAmCandidates,
        pm: lightweightPmCandidates,
      });
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: groqMessages.system },
          { role: "user", content: groqMessages.user },
        ],
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      return chatCompletion.choices[0]?.message?.content || "";
    });

  // One Gemini call, a second only when Gemini is busy (503), then Groq, then rules.
  let aiResult = await geminiRoutine(callGemini);
  if (!aiResult) {
    try {
      aiResult = readRoutinePayload(await callGroq());
    } catch (groqError) {
      const groqFailure = providerFailure(groqError);
      console.error("Routine providers failed", groqFailure.status ?? "");
      return rules;
    }
  }

  if (!aiResult) {
    return rules;
  }

  const assemble = (
    items: { id: string; matchReason: string; matchScore?: number }[] | undefined,
    fallback: typeof rules.amRoutine,
  ) => {
    const used = new Set<string>();
    const chosen = (items || [])
      .map((item) => {
        const picked = item as { id?: string; key?: string };
        const candidateProduct = productMap.get(picked.id || picked.key || "");
        if (!candidateProduct || used.has(candidateProduct.category)) return null;
        used.add(candidateProduct.category);
        return {
          ...candidateProduct,
          matchScore: candidateProduct.matchScore || item.matchScore || 80,
          matchReason: item.matchReason || candidateProduct.matchReason,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    for (const item of fallback) {
      if (!used.has(item.category)) {
        chosen.push(item);
        used.add(item.category);
      }
    }
    return chosen;
  };

  const amRoutine = assemble(aiResult.amRoutine, rules.amRoutine);
  const pmRoutine = assemble(aiResult.pmRoutine, rules.pmRoutine);
  const aiFilledBoth = (aiResult.amRoutine || []).length > 0 && (aiResult.pmRoutine || []).length > 0;
  const source = aiFilledBoth && amRoutine.length >= rules.amRoutine.length ? "ai" : "mixed";

  return {
    amRoutine,
    pmRoutine,
    summary:
      aiResult.aiSummary ||
      rules.summary,
    source,
  };
}