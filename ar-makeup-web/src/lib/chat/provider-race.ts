import {
  classifyProviderFailure,
  combineAbortSignals,
  geminiErrorStatus,
  geminiModelCoolingDown,
  rememberProviderFailure,
  type GeminiKeyOwner,
} from "../llm/gemini-models";

export const CHAT_CHAIN_MS = 25_000;
export const CHAT_HEDGE_MS = 4_000;
export const CHAT_FIRST_TOKEN_MS = 10_000;
export const CHAT_PROVIDER_MS = 20_000;
const FAST_503_MS = 4_000;

export type ChatAttempt<T> = {
  owner: GeminiKeyOwner;
  /** Breaker model segment. Groq uses "groq", not the Groq model id. */
  model: string;
  label: string;
  run: (signal: AbortSignal, onActivity: () => void) => Promise<T>;
};

export type ChatRaceResult<T> =
  | { kind: "ok"; label: string; value: T }
  | { kind: "bad-request" }
  | { kind: "fallback"; products: unknown };

function failureProducts(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("catalogProducts" in error)) return null;
  return error.catalogProducts ?? null;
}

function providerName(label: string) {
  return label.split("/")[0] || label;
}

/** Server log only. Status and a short reason, with secrets stripped. */
export function logChatProviderFailure(label: string, error: unknown, elapsedMs: number) {
  const classified = classifyProviderFailure(error);
  const status = classified.status ?? geminiErrorStatus(error);
  console.warn(
    "[chat] provider-error",
    providerName(label),
    `status=${status ?? "none"}`,
    `kind=${classified.kind}`,
    `ms=${elapsedMs}`,
    `reason=${providerFailureReason(error)}`,
  );
}

function providerFailureReason(error: unknown): string {
  const bits: string[] = [];
  if (error instanceof Error && error.message.trim()) bits.push(error.message.trim());
  if (error && typeof error === "object" && "responseBody" in error) {
    const body = error.responseBody;
    if (typeof body === "string" && body.trim()) {
      const message = groqStyleMessage(body);
      if (message) bits.push(message);
    }
  }
  const text = bits.join(" | ") || "request failed";
  return text
    .replace(/key=[^&\s]+/gi, "key=redacted")
    .replace(/Bearer\s+\S+/gi, "Bearer redacted")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-redacted")
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, "key-redacted")
    .slice(0, 300);
}

function groqStyleMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    return typeof parsed.error?.message === "string" ? parsed.error.message : body;
  } catch {
    return body;
  }
}

function remainingMs(started: number, chainMs: number) {
  return Math.max(0, chainMs - (Date.now() - started));
}

/**
 * Primary, then a hedged second provider, then a lite provider.
 * The first `run` to resolve wins. Losers are aborted.
 * The winner's abort controller stays open so its stream can finish.
 * One retry total, only after a 503 that arrives within 4s.
 */
export async function raceChatProviders<T>(input: {
  primary: ChatAttempt<T> | null;
  hedge: ChatAttempt<T> | null;
  lite: ChatAttempt<T> | null;
  chainMs?: number;
  hedgeMs?: number;
  providerMs?: number;
}): Promise<ChatRaceResult<T>> {
  const chainMs = input.chainMs ?? CHAT_CHAIN_MS;
  const hedgeMs = input.hedgeMs ?? CHAT_HEDGE_MS;
  const providerMs = input.providerMs ?? CHAT_PROVIDER_MS;
  const started = Date.now();
  const deadline = AbortSignal.timeout(chainMs);
  const stops: AbortController[] = [];
  let settled = false;
  let captured: unknown = null;
  let usedRetry = false;
  let hedgeStarted = input.hedge === null;
  let hedgeDone = input.hedge === null;
  let primaryDone = input.primary === null;
  let liteStarted = false;
  const liteDone = input.lite === null;

  let resolveRace: (result: ChatRaceResult<T>) => void = () => {};
  const race = new Promise<ChatRaceResult<T>>((resolve) => {
    resolveRace = resolve;
  });
  let winnerStop: AbortController | null = null;

  const finish = (result: ChatRaceResult<T>) => {
    if (settled) return;
    settled = true;
    clearTimeout(hedgeTimer);
    clearTimeout(watchdog);
    resolveRace(result);
    for (const stop of stops) {
      if (result.kind === "ok" && stop === winnerStop) continue;
      try {
        stop.abort();
      } catch {
        // The shopper response is already chosen.
      }
    }
  };

  const rememberCaptured = (error: unknown) => {
    const products = failureProducts(error);
    if (products != null && captured == null) captured = products;
  };

  const maybeFallback = () => {
    if (settled || !primaryDone || !hedgeDone) return;
    if (input.lite && !liteStarted && !liteDone && remainingMs(started, chainMs) >= 750 && !deadline.aborted) {
      liteStarted = true;
      void runAttempt(input.lite, () => {
        maybeFallback();
      });
      return;
    }
    finish({ kind: "fallback", products: captured });
  };

  const markHedgeDone = () => {
    hedgeDone = true;
    maybeFallback();
  };

  function startHedge() {
    if (hedgeStarted || settled) return;
    hedgeStarted = true;
    clearTimeout(hedgeTimer);
    if (!input.hedge) {
      markHedgeDone();
      return;
    }
    void runAttempt(input.hedge, markHedgeDone);
  }

  async function runAttempt(attempt: ChatAttempt<T>, markDone: () => void) {
    if (settled || deadline.aborted) {
      markDone();
      return;
    }
    if (geminiModelCoolingDown(attempt.owner, attempt.model)) {
      if (attempt === input.primary) startHedge();
      markDone();
      return;
    }
    const local = new AbortController();
    stops.push(local);
    const budget = Math.min(providerMs, Math.max(remainingMs(started, chainMs), 1));
    const signal = combineAbortSignals([
      AbortSignal.timeout(budget),
      deadline,
      local.signal,
    ]);
    const attemptStarted = Date.now();
    console.info("[chat] try", providerName(attempt.label));
    let notedFirst = false;
    try {
      const value = await attempt.run(signal, () => {
        if (!notedFirst) {
          notedFirst = true;
          console.info("[chat] first-token", providerName(attempt.label), `${Date.now() - attemptStarted}ms`);
        }
        if (attempt === input.primary && !settled) clearTimeout(hedgeTimer);
      });
      if (!settled) {
        winnerStop = local;
        finish({ kind: "ok", label: attempt.label, value });
      }
    } catch (error) {
      local.abort();
      if (!settled) logChatProviderFailure(attempt.label, error, Date.now() - attemptStarted);
      if (settled) return;
      rememberCaptured(error);
      if (deadline.aborted) {
        finish({ kind: "fallback", products: captured });
        return;
      }
      const classified = rememberProviderFailure(attempt.owner, attempt.model, error);
      if (classified.kind === "bad-request") {
        finish({ kind: "bad-request" });
        return;
      }
      const elapsed = Date.now() - attemptStarted;
      const fastUnavailable = classified.kind === "unavailable" && elapsed <= FAST_503_MS;
      if (fastUnavailable && !usedRetry && remainingMs(started, chainMs) > 1_000) {
        usedRetry = true;
        startHedge();
        await runAttempt(attempt, markDone);
        return;
      }
      if (
        classified.kind === "unavailable" ||
        classified.kind === "quota" ||
        classified.kind === "not-found" ||
        classified.kind === "timeout" ||
        classified.kind === "auth" ||
        classified.kind === "other"
      ) {
        startHedge();
      }
      markDone();
    }
  }

  const hedgeTimer = setTimeout(startHedge, hedgeMs);
  const watchdog = setTimeout(() => finish({ kind: "fallback", products: captured }), chainMs);
  deadline.addEventListener(
    "abort",
    () => {
      finish({ kind: "fallback", products: captured });
    },
    { once: true },
  );

  if (input.primary) {
    void runAttempt(input.primary, () => {
      primaryDone = true;
      maybeFallback();
    });
  } else {
    startHedge();
  }

  const result = await race;
  if (deadline.aborted) return result;
  return result;
}

export function timeoutError() {
  const error = new Error("timeout");
  error.name = "TimeoutError";
  return error;
}
