import { asStringList } from "./product-shape";
import type { ConcernScores } from "./recommend";

const AM_STEPS = ["Cleanser", "Treatment", "Eye cream", "Moisturizer", "sunscreen"] as const;
const PM_STEPS = ["Cleanser", "Treatment", "Eye cream", "Moisturizer"] as const;

/** Short on purpose: Groq's free tier rejects requests over 8000 tokens. */
const GROQ_SYSTEM_PROMPT =
  'Choose one product per step from the JSON only. Copy key into id. AM: Cleanser, Treatment, Eye cream, Moisturizer, sunscreen. PM: Cleanser, Treatment, Eye cream, Moisturizer. matchReason is one short sentence based on reason. matchScore is 80. aiSummary is two plain sentences and is not a medical diagnosis. Reply with JSON: {"aiSummary":"","amRoutine":[{"id":"","matchReason":"","matchScore":80}],"pmRoutine":[{"id":"","matchReason":"","matchScore":80}]}.';

const TOKEN_BUDGET = 6000;

type Slot = {
  id?: string;
  name?: string;
  category?: string;
  tags?: unknown;
};

function clip(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function concernLine(concerns: ConcernScores | string[]) {
  if (Array.isArray(concerns)) {
    return concerns
      .filter((item) => typeof item === "string")
      .slice(0, 6)
      .join(", ");
  }
  if (!concerns || typeof concerns !== "object") return "";
  const bag = concerns as Record<string, unknown> & { concerns?: { tag?: string }[] };
  if (Array.isArray(bag.concerns)) {
    return bag.concerns
      .map((item) => item?.tag)
      .filter((tag): tag is string => Boolean(tag))
      .slice(0, 6)
      .join(", ");
  }
  return Object.entries(bag)
    .filter(
      ([key, value]) =>
        key !== "version" && typeof value === "number" && Number.isFinite(value) && value > 0,
    )
    .slice(0, 6)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
}

function slots(
  lists: Record<string, Slot[] | undefined>,
  steps: readonly string[],
  skinType: string,
  nameMax: number,
  includeReason: boolean,
) {
  const out: Record<string, { key: string; name: string; category: string; reason?: string }[]> = {};
  for (const step of steps) {
    const product = lists[step]?.[0];
    if (!product?.id) {
      out[step] = [];
      continue;
    }
    const tags = asStringList(product.tags).slice(0, 2);
    const why = tags.length > 0 ? tags.join(", ") : "top score for this step";
    const row: { key: string; name: string; category: string; reason?: string } = {
      key: product.id,
      name: clip(product.name, nameMax),
      category: clip(product.category, 24),
    };
    if (includeReason) row.reason = clip(`Fits ${skinType}; ${why}`, 72);
    out[step] = [row];
  }
  return out;
}

export function estimateGroqTokens(message: { system: string; user: string }) {
  return Math.ceil((message.system.length + message.user.length) / 4);
}

export function buildGroqRoutineMessages(input: {
  skinType: string;
  concerns: ConcernScores | string[];
  am: Record<string, Slot[] | undefined>;
  pm: Record<string, Slot[] | undefined>;
}) {
  const skinType = clip(input.skinType, 24) || "Normal";
  const concerns = clip(concernLine(input.concerns), 160);

  const pack = (includeReason: boolean, nameMax: number) => {
    const payload = {
      skinType,
      concerns,
      am: slots(input.am, AM_STEPS, skinType, nameMax, includeReason),
      pm: slots(input.pm, PM_STEPS, skinType, nameMax, includeReason),
    };
    return {
      system: GROQ_SYSTEM_PROMPT,
      user: `JSON: ${JSON.stringify(payload)}`,
    };
  };

  const withReasons = pack(true, 60);
  if (estimateGroqTokens(withReasons) < TOKEN_BUDGET) return withReasons;
  return pack(false, 24);
}
