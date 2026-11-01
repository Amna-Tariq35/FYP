import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import Groq from "groq-sdk";
import {
  rememberProviderFailure,
  routineModelList,
  runGeminiModelChain,
  usesGeminiThinkingLevel,
} from "../llm/gemini-models";
import { Product, ConcernScores, RecommendedProduct, SkincareRoutine } from "./recommend";
import { getTopCandidates } from "./candidate-selector";
import { buildDeterministicRoutine, type SafetyContext } from "./deterministic-routine";
import { buildGroqRoutineMessages } from "./groq-payload";

/** Worst healthy baseline was well above this, so the cap in the task applies. */
const GEMINI_LIMIT_MS = 40_000;
const GROQ_LIMIT_MS = 18_000;
const CHAIN_LIMIT_MS = 50_000;
const MAX_OUTPUT_TOKENS = 640;
const ROUTINE_MODEL_MS = 15_000;

const AM_STEPS = ["Cleanser", "Treatment", "Eye cream", "Moisturizer", "sunscreen"] as const;
const PM_STEPS = ["Cleanser", "Treatment", "Eye cream", "Moisturizer"] as const;

const routineResponseSchema = {
  type: Type.OBJECT,
  properties: {
    aiSummary: { type: Type.STRING },
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
  required: ["aiSummary", "amRoutine", "pmRoutine"],
};

const SYSTEM_PROMPT =
  "Pick one product id per step from the JSON only. AM: Cleanser, Treatment, Eye cream, Moisturizer, sunscreen. PM: Cleanser, Treatment, Eye cream, Moisturizer. Use only listed ids. matchReason is one short sentence using the skin type and tags. matchScore copies score. aiSummary is two plain sentences and is not a medical diagnosis. Do not mention concerns missing from the profile.";

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

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

type ModelRoutine = {
  aiSummary?: string;
  amRoutine?: { id: string; matchReason: string; matchScore?: number }[];
  pmRoutine?: { id: string; matchReason: string; matchScore?: number }[];
};

type ProviderCall = (signal: AbortSignal) => Promise<unknown>;

function isRoutineStep(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const step = value as { id?: unknown; matchReason?: unknown; matchScore?: unknown };
  return (
    typeof step.id === "string" &&
    typeof step.matchReason === "string" &&
    typeof step.matchScore === "number" &&
    Number.isInteger(step.matchScore)
  );
}

function isRoutineStepList(
  value: unknown,
): value is { id: string; matchReason: string; matchScore: number }[] {
  return Array.isArray(value) && value.every(isRoutineStep);
}

export function routineTextMatchesSchema(value: unknown) {
  let parsed: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const record = parsed as { aiSummary?: unknown; amRoutine?: unknown; pmRoutine?: unknown };
  if (typeof record.aiSummary !== "string") return false;
  if (!isRoutineStepList(record.amRoutine) || !isRoutineStepList(record.pmRoutine)) return false;
  return record.amRoutine.length > 0 || record.pmRoutine.length > 0;
}

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

function clip(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function compactSteps(
  lists: Record<string, RecommendedProduct[]>,
  steps: readonly string[],
) {
  const out: Record<string, { id: string; name: string; category: string; score: number; tags: string[] }[]> = {};
  for (const step of steps) {
    out[step] = (lists[step] ?? []).slice(0, 1).map((product) => ({
      id: product.id,
      name: clip(product.name, 48),
      category: product.category,
      score: Math.round(product.matchScore || 80),
      tags: (product.tags ?? []).slice(0, 2).map((tag) => clip(String(tag), 24)),
    }));
  }
  return out;
}

function combineSignals(timeoutMs: number, ...extra: AbortSignal[]) {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  const signals = [timeout, ...extra];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function raceSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    const reason = signal.reason;
    return Promise.reject(reason instanceof Error ? reason : new Error("aborted"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const reason = signal.reason;
      reject(reason instanceof Error ? reason : new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

const HEDGE_MS = 8_000;

async function firstModelResult(
  callGemini: ProviderCall,
  callGroq: ProviderCall,
  hedgeMs: number,
  geminiLabel: () => string,
): Promise<{ routine: ModelRoutine | null; provider: string }> {
  const started = Date.now();
  const remaining = () => CHAIN_LIMIT_MS - (Date.now() - started);
  const chain = AbortSignal.timeout(CHAIN_LIMIT_MS);
  const geminiStop = new AbortController();
  const groqStop = new AbortController();
  const stopBoth = () => {
    geminiStop.abort();
    groqStop.abort();
  };
  if (chain.aborted) stopBoth();
  else chain.addEventListener("abort", stopBoth, { once: true });

  let accepted: ModelRoutine | null = null;
  let provider = "rules";
  const take = (value: ModelRoutine | null, winner: "gemini" | "groq") => {
    if (!value || accepted) return;
    accepted = value;
    provider = winner === "groq" ? "groq" : geminiLabel() || "gemini";
    if (winner === "gemini") groqStop.abort();
    else geminiStop.abort();
  };

  let groqTask: Promise<void> | null = null;
  const startGroq = () => {
    if (groqTask || accepted || remaining() < 1) return;
    const signal = combineSignals(Math.min(GROQ_LIMIT_MS, remaining()), groqStop.signal, chain);
    groqTask = (async () => {
      try {
        take(readRoutinePayload(await raceSignal(callGroq(signal), signal)), "groq");
      } catch (error) {
        if (accepted || signal.aborted || isAbortError(error)) return;
        const failure = providerFailure(error);
        rememberProviderFailure("routine", "groq", error);
        console.error("Routine providers failed", failure.status ?? "", failure.message);
      }
    })();
  };

  const hedge = setTimeout(startGroq, hedgeMs);
  let busy = false;
  try {
    const signal = combineSignals(Math.min(GEMINI_LIMIT_MS, Math.max(remaining(), 1)), geminiStop.signal, chain);
    const parsed = readRoutinePayload(await raceSignal(callGemini(signal), signal));
    if (parsed) take(parsed, "gemini");
    else if (!accepted) console.warn("Gemini routine was empty. Trying the next provider.");
  } catch (error) {
    if (!accepted && !isAbortError(error) && !geminiStop.signal.aborted) {
      const failure = providerFailure(error);
      console.warn("Gemini routine failed", failure.status ?? "", failure.message);
      busy = isGeminiBusy(error);
    }
  } finally {
    clearTimeout(hedge);
  }

  if (!accepted) startGroq();

  if (busy && !accepted && !geminiStop.signal.aborted && remaining() >= 2_000) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (busy && !accepted && !geminiStop.signal.aborted && remaining() >= 2_000) {
    try {
      const signal = combineSignals(
        Math.min(GEMINI_LIMIT_MS, remaining()),
        geminiStop.signal,
        chain,
      );
      const parsed = readRoutinePayload(await raceSignal(callGemini(signal), signal));
      if (parsed) take(parsed, "gemini");
      else if (!accepted) console.warn("Gemini retry was empty. Trying the next provider.");
    } catch (error) {
      if (!accepted && !geminiStop.signal.aborted && !isAbortError(error)) {
        const failure = providerFailure(error);
        console.warn("Gemini retry failed", failure.status ?? "", failure.message);
      }
    }
  }

  if (groqTask) await groqTask;
  return { routine: accepted, provider: accepted ? provider : "rules" };
}

export async function generateFinalRoutine(
  allDbProducts: Product[],
  userSkinType: string,
  concernScores: ConcernScores | string[],
  safety: SafetyContext = {},
  models?: {
    gemini?: (signal: AbortSignal) => Promise<unknown>;
    groq?: (signal: AbortSignal) => Promise<unknown>;
    hedgeMs?: number;
  },
): Promise<SkincareRoutine & { summary: string; source: "ai" | "rules" | "mixed"; provider: string }> {
  const candidates = getTopCandidates(allDbProducts, userSkinType, concernScores, 3);
  const productMap = new Map<string, RecommendedProduct>();
  for (const product of Object.values(candidates.amCandidates).flat()) productMap.set(product.id, product);
  for (const product of Object.values(candidates.pmCandidates).flat()) productMap.set(product.id, product);

  const amCandidates = compactSteps(candidates.amCandidates, AM_STEPS);
  const pmCandidates = compactSteps(candidates.pmCandidates, PM_STEPS);
  const userPayload = {
    skinType: userSkinType,
    concerns: concernScores,
    am: amCandidates,
    pm: pmCandidates,
  };

  const rules = buildDeterministicRoutine(allDbProducts, userSkinType, concernScores, {
    ...safety,
    skinType: userSkinType,
  });

  let geminiModel = "";
  const callGemini: ProviderCall = async (signal) => {
    if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (models?.gemini) return models.gemini(signal);
    const skincareKey = process.env.GEMINI_API_KEY;
    if (!skincareKey) throw new Error("Gemini key is not configured");
    const text = await runGeminiModelChain({
      apiKey: skincareKey,
      owner: "routine",
      models: routineModelList(),
      parent: signal,
      perModelMs: ROUTINE_MODEL_MS,
      accept: routineTextMatchesSchema,
      onAccepted: (model) => {
        geminiModel = model;
      },
      invoke: async (model, modelSignal, apiKey) => {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: routineResponseSchema,
            temperature: 0.2,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...(usesGeminiThinkingLevel(model)
              ? {
                  thinkingConfig: {
                    thinkingLevel: ThinkingLevel.LOW,
                    includeThoughts: false,
                  },
                }
              : {}),
            abortSignal: modelSignal,
            httpOptions: {
              retryOptions: { attempts: 1 },
            },
          },
        });
        return response.text || "";
      },
    });
    return text ?? "";
  };

  const callGroq: ProviderCall = async (signal) => {
    if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (models?.groq) return models.groq(signal);
    const groqKey = process.env.GROQ_SKINCARE_API_KEY;
    if (!groqKey) throw new Error("Groq key is not configured");
    const groq = new Groq({ apiKey: groqKey, maxRetries: 0 });
    const groqMessages = buildGroqRoutineMessages({
      skinType: userSkinType,
      concerns: concernScores,
      am: amCandidates,
      pm: pmCandidates,
    });
    const chatCompletion = await groq.chat.completions.create(
      {
        messages: [
          { role: "system", content: groqMessages.system },
          { role: "user", content: groqMessages.user },
        ],
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      { signal, maxRetries: 0 },
    );
    return chatCompletion.choices[0]?.message?.content || "";
  };

  const picked = await firstModelResult(
    callGemini,
    callGroq,
    models?.hedgeMs ?? HEDGE_MS,
    () => geminiModel,
  );
  const aiResult = picked.routine;
  if (!aiResult) return { ...rules, provider: "rules" };

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
      .filter((product): product is NonNullable<typeof product> => product !== null);

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
    summary: aiResult.aiSummary || rules.summary,
    source,
    provider: picked.provider,
  };
}
