/**
 * Gemini model order for skin routine text and photo vision.
 * GEMINI_VISION_MODEL, when set, is prepended to GEMINI_VISION_MODELS
 * (or these defaults) and tried first. Duplicates are removed.
 * The models.list payload has no image-input or responseSchema field.
 */

const QUOTA_SKIP_MS = 60_000;
const NOT_FOUND_SKIP_MS = 10 * 60 * 1000;

export const DEFAULT_ROUTINE_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"] as const;

export const DEFAULT_VISION_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"] as const;

export const DEFAULT_CHAT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;

export type GeminiKeyOwner = "chat" | "routine";

const quotaSkipUntil = new Map<string, number>();

/** Breaker id is key-owner plus model, so one key's 429 cannot cool the other key's model. */
export function providerBreakerId(owner: GeminiKeyOwner, model: string) {
  return `${owner}:${model}`;
}

export function clearGeminiQuotaSkips() {
  quotaSkipUntil.clear();
}

export function routineModelList(envValue = process.env.GEMINI_ROUTINE_MODELS): string[] {
  return parseModelList(envValue, DEFAULT_ROUTINE_MODELS);
}

export function chatModelList(envValue = process.env.GEMINI_CHAT_MODELS): string[] {
  return parseModelList(envValue, DEFAULT_CHAT_MODELS);
}

export function visionModelList(
  listValue = process.env.GEMINI_VISION_MODELS,
  overrideValue = process.env.GEMINI_VISION_MODEL,
): string[] {
  const listed = parseModelList(listValue, DEFAULT_VISION_MODELS);
  const override = overrideValue?.trim();
  if (!override) return listed;
  return [override, ...listed.filter((model) => model !== override)];
}

function parseModelList(raw: string | undefined, defaults: readonly string[]): string[] {
  const source = raw && raw.trim() ? raw.split(",") : [...defaults];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of source) {
    const model = item.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models.length > 0 ? models : [...defaults];
}

export function geminiModelCoolingDown(owner: GeminiKeyOwner, model: string, now = Date.now()) {
  const id = providerBreakerId(owner, model);
  const until = quotaSkipUntil.get(id) ?? 0;
  if (until <= now) {
    if (until) quotaSkipUntil.delete(id);
    return false;
  }
  return true;
}

export function skipGeminiModelForQuota(owner: GeminiKeyOwner, model: string, now = Date.now()) {
  skipGeminiModel(providerBreakerId(owner, model), QUOTA_SKIP_MS, now);
}

function skipGeminiModel(id: string, durationMs: number, now = Date.now()) {
  quotaSkipUntil.set(id, now + durationMs);
}

export function combineAbortSignals(signals: AbortSignal[]) {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function readNumericStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    error?: unknown;
  };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.code === "number" && record.code >= 400 && record.code <= 599) return record.code;
  const response = "response" in record ? record.response : undefined;
  if (response && typeof response === "object" && "status" in response && typeof response.status === "number") {
    return response.status;
  }
  if (record.error && record.error !== error) return readNumericStatus(record.error);
  const cause = "cause" in record ? record.cause : undefined;
  if (cause && cause !== error) return readNumericStatus(cause);
  const lastError = "lastError" in record ? record.lastError : undefined;
  if (lastError && lastError !== error) return readNumericStatus(lastError);
  return undefined;
}

export function geminiErrorStatus(error: unknown): number | undefined {
  const numeric = readNumericStatus(error);
  if (numeric !== undefined) return numeric;
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/\b(400|401|403|404|408|429|503)\b/);
  return match ? Number(match[1]) : undefined;
}

function isModelNotFound(error: unknown, status: number | undefined) {
  if (status === 400) return false;
  if (status === 404) return true;
  if (status !== undefined) return false;
  if (error && typeof error === "object") {
    const record = error as { status?: unknown; error?: unknown };
    if (record.status === "NOT_FOUND") return true;
    if (record.error && typeof record.error === "object") {
      const inner = record.error as { status?: unknown };
      if (inner.status === "NOT_FOUND") return true;
    }
  }
  const message = error instanceof Error ? error.message : "";
  return /\b404\b/.test(message) || /\bNOT_FOUND\b/.test(message);
}

function safeErrorText(error: unknown) {
  const raw = error instanceof Error ? error.message : "request failed";
  return raw
    .replace(/key=[^&\s]+/gi, "key=redacted")
    .replace(/Bearer\s+\S+/gi, "Bearer redacted")
    .slice(0, 240);
}

function logGemini(kind: string, model: string, error?: unknown) {
  if (!error) {
    console.warn(`Gemini ${kind}`, model);
    return;
  }
  console.warn(`Gemini ${kind}`, model, geminiErrorStatus(error) ?? "", safeErrorText(error));
}

function linkedSignal(parent: AbortSignal, perModelMs: number) {
  return combineAbortSignals([AbortSignal.timeout(Math.max(1, perModelMs)), parent]);
}

export function abortReason(signal: AbortSignal) {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("timeout");
  error.name = "TimeoutError";
  return error;
}

function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
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

function isTimeout(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const status = geminiErrorStatus(error);
  return status === 408;
}

export type ProviderFailureKind =
  | "bad-request"
  | "auth"
  | "not-found"
  | "quota"
  | "unavailable"
  | "timeout"
  | "other";

export function classifyProviderFailure(error: unknown): { status?: number; kind: ProviderFailureKind } {
  if (isTimeout(error)) return { status: geminiErrorStatus(error), kind: "timeout" };
  const status = geminiErrorStatus(error);
  if (status === 400) return { status, kind: "bad-request" };
  if (status === 401 || status === 403) return { status, kind: "auth" };
  if (isModelNotFound(error, status)) return { status: status ?? 404, kind: "not-found" };
  if (status === 429) return { status, kind: "quota" };
  if (status === 503) return { status, kind: "unavailable" };
  return { status, kind: "other" };
}

/** Records 429 for 60s and 404 for 10 minutes under this key owner. 503 and timeouts are not skipped. */
export function rememberProviderFailure(owner: GeminiKeyOwner, model: string, error: unknown) {
  const classified = classifyProviderFailure(error);
  const id = providerBreakerId(owner, model);
  if (classified.kind === "not-found") skipGeminiModel(id, NOT_FOUND_SKIP_MS);
  if (classified.kind === "quota") skipGeminiModel(id, QUOTA_SKIP_MS);
  return classified;
}

function isInvalidOutput(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AI_NoObjectGeneratedError" || name === "AI_TypeValidationError" || name === "ZodError";
}

export async function runGeminiModelChain<T>(options: {
  apiKey: string;
  owner: GeminiKeyOwner;
  models: string[];
  parent: AbortSignal;
  perModelMs: number;
  invoke: (model: string, signal: AbortSignal, apiKey: string) => Promise<T>;
  accept: (value: T) => boolean;
  onAccepted?: (model: string) => void;
}): Promise<T | null> {
  if (!options.apiKey.trim()) return null;

  let sawTimeout = false;
  let lastUnavailable: unknown = null;

  for (const model of options.models) {
    if (options.parent.aborted) throw abortReason(options.parent);
    if (geminiModelCoolingDown(options.owner, model)) {
      logGemini("cooldown", model);
      continue;
    }

    const signal = linkedSignal(options.parent, options.perModelMs);
    try {
      const value = await raceAbort(options.invoke(model, signal, options.apiKey), signal);
      if (options.accept(value)) {
        options.onAccepted?.(model);
        return value;
      }
      logGemini("invalid output", model);
    } catch (error) {
      if (options.parent.aborted) throw error;
      if (isInvalidOutput(error)) {
        logGemini("invalid output", model, error);
        continue;
      }
      const classified = rememberProviderFailure(options.owner, model, error);
      if (classified.kind === "bad-request") {
        logGemini("bad request", model, error);
        throw error;
      }
      if (classified.kind === "auth") {
        logGemini("auth failed", model, error);
        throw error;
      }
      if (classified.kind === "not-found") {
        logGemini("not found", model, error);
        continue;
      }
      if (classified.kind === "quota") {
        logGemini("quota skip", model, error);
        continue;
      }
      if (classified.kind === "unavailable") {
        lastUnavailable = error;
        logGemini("unavailable", model, error);
        continue;
      }
      if (classified.kind === "timeout") {
        sawTimeout = true;
        logGemini("timeout", model, error);
        continue;
      }
      logGemini("request failed", model, error);
    }
  }

  if (!sawTimeout && lastUnavailable) throw lastUnavailable;
  return null;
}

export function usesGeminiThinkingLevel(model: string) {
  return model === "gemini-3.8-flash" || model.startsWith("gemini-3.") || model.startsWith("gemini-3-");
}
