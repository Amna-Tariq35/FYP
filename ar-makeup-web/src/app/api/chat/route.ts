import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { clientKey, rateLimit } from "@/src/lib/skin-analysis/rate-limit";
import { loadShopperMatchProfile } from "@/src/lib/catalog/product-profile-matching";
import { searchCatalogCards, lastUserText, type ChatCatalogCard } from "@/src/lib/chat/catalog-fallback";
import {
  allowsModelCategory,
  CHAT_CATEGORY_LIST,
  composeShopperText,
  searchChatProducts,
  shouldAnswerWithoutModel,
  type ChatRelaxation,
} from "@/src/lib/chat/catalog-search";
import {
  CHAT_FAILURE_MESSAGE,
  CHAT_NO_MATCH_SENTENCE,
  CHAT_WAIT_MESSAGE,
  friendlyChatError,
  isPlaceholderAssistantText,
} from "@/src/lib/chat/public-error";
import {
  CHAT_FIRST_TOKEN_MS,
  raceChatProviders,
  timeoutError,
  type ChatAttempt,
} from "@/src/lib/chat/provider-race";
import {
  abortReason,
  chatModelList,
  usesGeminiThinkingLevel,
} from "@/src/lib/llm/gemini-models";

const DEFAULT_GROQ_CHAT_MODEL = "openai/gpt-oss-120b";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGES_IN_CONTEXT = 8;
const MAX_MESSAGE_CHARS = 2_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trimMessages(messages: UIMessage[]): UIMessage[] {
  const recent = messages.slice(-MAX_MESSAGES_IN_CONTEXT);
  const trimmed: UIMessage[] = [];
  for (const message of recent) {
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      const text = part.text.slice(0, MAX_MESSAGE_CHARS);
      if (!text.trim()) continue;
      parts.push({ type: "text", text });
    }
    if (parts.length === 0) continue;
    trimmed.push({ ...message, parts });
  }
  return trimmed;
}

function groqChatModel() {
  const configured = process.env.GROQ_CHAT_MODEL?.trim();
  return configured || DEFAULT_GROQ_CHAT_MODEL;
}

function localChatReply(text: string, products?: ChatCatalogCard[]): Response {
  const cards = products ?? [];
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "local";
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      if (cards.length > 0) {
        writer.write({
          type: "tool-input-available",
          toolCallId: "catalog-fallback",
          toolName: "searchProducts",
          input: {},
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: "catalog-fallback",
          output: { success: true, products: cards, message: "" },
        });
      } else if (products) {
        writer.write({
          type: "tool-input-available",
          toolCallId: "catalog-fallback",
          toolName: "searchProducts",
          input: {},
        });
        writer.write({
          type: "tool-output-available",
          toolCallId: "catalog-fallback",
          output: { success: true, products: [], message: "", catalogHref: "/products" },
        });
      }
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: () => friendlyChatError(undefined),
  });
  return createUIMessageStreamResponse({ stream });
}

async function catalogFallbackReply(messages: UIMessage[]): Promise<Response> {
  try {
    const products = await searchCatalogCards(lastUserText(messages));
    return localChatReply(CHAT_FAILURE_MESSAGE, products);
  } catch {
    console.error("[chat/route] catalog fallback failed");
    return localChatReply(CHAT_FAILURE_MESSAGE, []);
  }
}

async function directNoMatch(userText: string): Promise<Response | null> {
  if (!shouldAnswerWithoutModel(userText)) return null;
  try {
    const found = await searchChatProducts({ text: userText });
    if (!found.ok || found.products.length > 0) return null;
    return localChatReply(CHAT_NO_MATCH_SENTENCE, []);
  } catch {
    console.error("[chat] catalog lookup failed");
    return null;
  }
}

function asCard(value: unknown): ChatCatalogCard | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.product_key !== "string" || row.product_key.length === 0 || typeof row.name !== "string") {
    return null;
  }
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  if (!Number.isFinite(price)) return null;
  return {
    id: typeof row.id === "string" ? row.id : row.product_key,
    product_key: row.product_key,
    name: row.name,
    brand: typeof row.brand === "string" ? row.brand : "",
    category: typeof row.category === "string" ? row.category : "",
    price,
    image_url: typeof row.image_url === "string" ? row.image_url : undefined,
    finish: typeof row.finish === "string" ? row.finish : undefined,
    skin_type: typeof row.skin_type === "string" ? row.skin_type : undefined,
  };
}

function cardsFromToolOutput(output: unknown): ChatCatalogCard[] | null {
  if (!output || typeof output !== "object") return null;
  const record = output as { products?: unknown };
  if (!Array.isArray(record.products)) return null;
  return record.products.map(asCard).filter((card): card is ChatCatalogCard => card !== null);
}

function withCatalogProducts(error: unknown, products: ChatCatalogCard[] | null) {
  if (!products || !error || typeof error !== "object") return error;
  Object.assign(error, { catalogProducts: products });
  return error;
}

type ProbePart = {
  type: string;
  text?: string;
  error?: unknown;
  output?: unknown;
  finishReason?: string;
};

function keepStreamMoving(iterator: AsyncIterator<ProbePart>) {
  void (async () => {
    try {
      while (!(await iterator.next()).done) {
        // The other tee feeds the shopper response. This side must keep reading.
      }
    } catch {
      // A failure after the reply starts is closed by the shopper stream.
    }
  })();
}

async function nextProbePart(
  iterator: AsyncIterator<ProbePart>,
  signal: AbortSignal,
  firstToken: AbortSignal,
) {
  let onSignal = () => {};
  let onFirst = () => {};
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        onSignal = () => reject(abortReason(signal));
        onFirst = () => reject(timeoutError());
        if (signal.aborted) {
          onSignal();
          return;
        }
        if (firstToken.aborted) {
          onFirst();
          return;
        }
        signal.addEventListener("abort", onSignal, { once: true });
        firstToken.addEventListener("abort", onFirst, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onSignal);
    firstToken.removeEventListener("abort", onFirst);
  }
}

function emptyAnswer(products: ChatCatalogCard[] | null) {
  return withCatalogProducts(new Error("empty model output"), products);
}

function streamFailure() {
  let rejectError: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    rejectError = reject;
  });
  failed.catch(() => {});
  return {
    failed,
    onError: ({ error }: { error: unknown }) => {
      rejectError(error instanceof Error ? error : new Error("provider failed"));
    },
  };
}

async function readUntilOutput(
  result: { fullStream: AsyncIterable<ProbePart> },
  signal: AbortSignal,
  onActivity: () => void,
  failed?: Promise<never>,
) {
  const iterator = result.fullStream[Symbol.asyncIterator]();
  const firstToken = AbortSignal.timeout(Math.min(CHAT_FIRST_TOKEN_MS, 10_000));
  const idle = new AbortController();
  let products: ChatCatalogCard[] | null = null;
  let text = "";
  let awaitingTool = false;
  let sawActivity = false;

  const accept = () => {
    if (isPlaceholderAssistantText(text)) return false;
    keepStreamMoving(iterator);
    return true;
  };

  while (true) {
    const next = await Promise.race([
      nextProbePart(iterator, signal, sawActivity ? idle.signal : firstToken),
      ...(failed ? [failed] : []),
    ]);
    if (next.done) {
      if (accept()) return products;
      throw emptyAnswer(products);
    }
    const part = next.value;
    if (part.type === "text-delta") {
      text += part.text ?? "";
      sawActivity = true;
      onActivity();
    } else if (part.type === "reasoning-delta") {
      // Reasoning is not an answer. Keep the first-token deadline so a
      // thought-only stream cannot hold the chain for the whole provider budget.
    } else if (
      part.type === "tool-input-start" ||
      part.type === "tool-input-delta" ||
      part.type === "tool-call"
    ) {
      awaitingTool = true;
      sawActivity = true;
      onActivity();
    } else if (part.type === "tool-result") {
      awaitingTool = false;
      const found = cardsFromToolOutput(part.output);
      if (found) products = found;
      sawActivity = true;
      onActivity();
    } else if (part.type === "tool-error") {
      awaitingTool = false;
      sawActivity = true;
      onActivity();
      if (!accept()) {
        const reason =
          part.error instanceof Error
            ? part.error
            : new Error(typeof part.error === "string" && part.error.trim() ? part.error : "invalid tool call");
        throw withCatalogProducts(reason, products);
      }
    } else if (part.type === "finish-step") {
      const reason = part.finishReason ?? "";
      const stopped = reason === "stop" || reason === "length" || reason === "content-filter" || reason === "error";
      if (stopped && !awaitingTool && !accept()) throw emptyAnswer(products);
    } else if (part.type === "error") {
      const error = part.error instanceof Error ? part.error : new Error("provider failed");
      throw withCatalogProducts(error, products);
    }

    if (part.type === "finish" || part.type === "abort") {
      if (accept()) return products;
      throw emptyAnswer(products);
    }
    if (!awaitingTool && accept()) return products;
  }
}

const RELAXATION_FLAGS = new Set<ChatRelaxation>(["skin", "price", "brand"]);

function asRelaxations(value: unknown): ChatRelaxation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatRelaxation => typeof item === "string" && RELAXATION_FLAGS.has(item as ChatRelaxation));
}

function toolFacts(output: unknown): { note: string; relaxed: ChatRelaxation[]; noMatch: boolean } {
  if (!output || typeof output !== "object") return { note: "", relaxed: [], noMatch: false };
  const record = output as Record<string, unknown>;
  const products = Array.isArray(record.products) ? record.products : null;
  return {
    note: typeof record.note === "string" ? record.note : "",
    relaxed: asRelaxations(record.relaxed),
    noMatch: record.success === true && products?.length === 0 && record.catalogHref === "/products",
  };
}

function rewriteHonestResponse(response: Response): Response {
  if (!response.body) return response;
  let carry = "";
  let text = "";
  let note = "";
  let relaxed: ChatRelaxation[] = [];
  let noMatch = false;
  let textId = "reply";
  let flushed = false;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const honestEvents = (): string => {
    if (flushed) return "";
    flushed = true;
    const finalText = composeShopperText({ text, note, relaxed, noMatch });
    if (!finalText) return "";
    const id = textId;
    return (
      `data: ${JSON.stringify({ type: "text-start", id })}\n\n` +
      `data: ${JSON.stringify({ type: "text-delta", id, delta: finalText })}\n\n` +
      `data: ${JSON.stringify({ type: "text-end", id })}\n\n`
    );
  };

  const onEvent = (event: string): string => {
    const line = event.split("\n").find((item) => item.startsWith("data:"));
    if (!line) return `${event}\n\n`;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return `${honestEvents()}${event}\n\n`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return `${event}\n\n`;
    }
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return `${event}\n\n`;
    const chunk = parsed as { type?: unknown; id?: unknown; delta?: unknown; output?: unknown };
    if (chunk.type === "text-start" && typeof chunk.id === "string") {
      textId = chunk.id;
      return "";
    }
    if (chunk.type === "text-delta") {
      text += typeof chunk.delta === "string" ? chunk.delta : "";
      return "";
    }
    if (chunk.type === "text-end") return "";
    if (chunk.type === "tool-output-available") {
      const facts = toolFacts(chunk.output);
      note = facts.note;
      relaxed = facts.relaxed;
      noMatch = facts.noMatch;
      return `${event}\n\n`;
    }
    if (chunk.type === "finish") return `${honestEvents()}${event}\n\n`;
    return `${event}\n\n`;
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      carry += decoder.decode(chunk, { stream: true });
      const parts = carry.split("\n\n");
      carry = parts.pop() ?? "";
      let out = "";
      for (const part of parts) {
        if (part.trim()) out += onEvent(part);
      }
      if (out) controller.enqueue(encoder.encode(out));
    },
    flush(controller) {
      carry += decoder.decode();
      let out = carry.trim() ? onEvent(carry) : "";
      out += honestEvents();
      if (out) controller.enqueue(encoder.encode(out));
    },
  });

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function omittedText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function omittedPrice(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

function summarizeToolOutput(output: unknown) {
  const record = output && typeof output === "object" ? (output as Record<string, unknown>) : {};
  const rows = Array.isArray(record.products) ? record.products : [];
  const products = rows.slice(0, 5).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const price = typeof item.price === "number" ? item.price : Number(item.price);
    if (!Number.isFinite(price) || typeof item.name !== "string") return [];
    const shades = Array.isArray(item.product_shades) ? item.product_shades : [];
    const colors: string[] = [];
    for (const shade of shades) {
      if (colors.length >= 2 || !shade || typeof shade !== "object") continue;
      const family = (shade as { color_family?: unknown }).color_family;
      if (typeof family === "string" && family.trim() && !colors.includes(family)) colors.push(family);
    }
    return [
      {
        name: item.name,
        brand: typeof item.brand === "string" ? item.brand : "",
        price,
        category: typeof item.category === "string" ? item.category : "",
        ...(typeof item.finish === "string" && item.finish ? { finish: item.finish } : {}),
        ...(typeof item.skin_type === "string" && item.skin_type ? { skin_type: item.skin_type } : {}),
        ...(colors.length > 0 ? { colors } : {}),
      },
    ];
  });
  const relaxed = asRelaxations(record.relaxed);
  return {
    success: record.success === true,
    count: products.length,
    ...(typeof record.message === "string" && record.message ? { message: record.message.slice(0, 180) } : {}),
    ...(typeof record.note === "string" && record.note ? { note: record.note.slice(0, 180) } : {}),
    ...(relaxed.length > 0 ? { relaxed } : {}),
    ...(record.catalogHref === "/products" ? { catalogHref: "/products" } : {}),
    products,
  };
}

// ─── SINGLE SMART TOOL: For Both Makeup & Skincare ───────────────────────────
function buildSearchTool(userText: string, followUp: boolean) {
  return tool({
  description: `Fetch in-stock makeup and skincare from this store. category must be one of: ${CHAT_CATEGORY_LIST}. Everyday words are mapped (lip, lipstick, moisturiser, moisturizer, sunscreen, SPF, lip gloss, foundation, blush). Prices are US dollars, shown as $12.00, the same as product cards and the cart. A number the shopper types is already in dollars. Do not convert currency. If a skin type, price, or brand would hide every in-stock match, drop skin type, then price, then brand. The result then includes relaxed, such as ["price"], and a note. You must say that note. Never present those products as meeting the dropped constraint.`,
  inputSchema: z.object({
    category: z
      .string()
      .nullish()
      .describe(
        `One of: ${CHAT_CATEGORY_LIST}. lip and lipstick -> lipstick, lip gloss -> lip_gloss, moisturiser -> moisturizer, SPF -> sunscreen.`
      ),
    skinType: z
      .string()
      .nullish()
      .describe("e.g. Oily, Dry, Combination, Normal"),
    itemForm: z
      .string()
      .nullish()
      .describe("e.g. Liquid, Powder, Stick, Cream, Serum"),
    tags: z
      .string()
      .nullish()
      .describe(
        "e.g. acne, hydrating, matte, anti-aging, vegan (matches with DB tags)"
      ),
    colorFamily: z
      .string()
      .nullish()
      .describe("e.g. Red, Pink, Nude (Mostly for makeup)"),
    undertone: z.string().nullish().describe("e.g. Warm, Cool, Neutral"),
    finish: z
      .string()
      .nullish()
      .describe("e.g. matte, dewy, satin. Prefer products with this finish."),
    brand: z.string().nullish().describe("Brand name, only when the shopper names one."),
    minPrice: z.union([z.number(), z.string()]).nullish().describe("Minimum price in US dollars, if the shopper gave one."),
    maxPrice: z
      .union([z.number(), z.string()])
      .nullish()
      .describe("Maximum price in US dollars. Use 1 when they say under 1. Do not convert."),
  }),
  toModelOutput: ({ output }) => ({ type: "json" as const, value: summarizeToolOutput(output) }),
  execute: async ({
    category,
    skinType,
    itemForm,
    tags,
    colorFamily,
    undertone,
    finish,
    brand,
    minPrice,
    maxPrice,
  }) => {
    try {
      const stored = await loadShopperMatchProfile(await createSupabaseServerClient());
      const found = await searchChatProducts({
        category: allowsModelCategory(userText) || followUp ? omittedText(category) : undefined,
        text: userText,
        skinType: omittedText(skinType) || stored?.skinType || undefined,
        itemForm: omittedText(itemForm),
        tags: omittedText(tags),
        colorFamily: omittedText(colorFamily),
        undertone: omittedText(undertone),
        finish: omittedText(finish) || stored?.finish || undefined,
        brand: omittedText(brand),
        minPrice: omittedPrice(minPrice),
        maxPrice: omittedPrice(maxPrice),
      });
      if (!found.ok) {
        return { success: false, products: [], message: "Database error occurred." };
      }
      if (found.products.length === 0) {
        return {
          success: true,
          products: [],
          message: "No matching products found.",
          catalogHref: "/products",
        };
      }
      if (found.relaxed.length > 0) {
        return {
          success: true,
          products: found.products,
          message: found.note,
          relaxed: found.relaxed,
          note: found.note,
        };
      }
      return { success: true, products: found.products, message: "" };
    } catch (err) {
      console.error("[searchProducts] Unexpected error:", err);
      return {
        success: false,
        products: [],
        message: "Unexpected error fetching products.",
      };
    }
  },
  });
}

// ─── System Prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a shopping guide for this store's makeup and skincare catalog.
You help people choose products. You are not a dermatologist, and you do not diagnose skin conditions or give clinical treatment advice.

STRICT RULES:
1. ALWAYS call the 'searchProducts' tool before answering product-related questions.
2. Extract context and pass a real category: ${CHAT_CATEGORY_LIST}. "face wash" is cleanser, "red lipstick" is lipstick with colorFamily Red, "lip gloss" is lip_gloss, "moisturiser" is moisturizer, "SPF" is sunscreen. For "under 100", set maxPrice to 100. Prices are US dollars. Say $12.00, the same format as the product cards and the cart. A number the shopper types is already in dollars. Never convert currency and never say Rs, PKR, or rupees.
3. NEVER list plain text product IDs, database ids, or raw data. Product cards are rendered from tool results and must be identified only by product_key.
4. Keep your response conversational and short (1-2 sentences).
5. If someone asks for a medical diagnosis or treatment plan, say you can only help them shop for products.
6. If the tool result includes relaxed, those filters were dropped. Say the note field verbatim. Do not say the products meet a dropped price, skin type, or brand.

FALLBACK RULE:
If the tool returns any products, recommend those products. When relaxed is present, the note comes first. Use the sentence below ONLY when the products array is empty:
"${CHAT_NO_MATCH_SENTENCE}"`;

function chatStream(result: { toUIMessageStreamResponse: (init?: { onError?: (error: unknown) => string }) => Response }) {
  return rewriteHonestResponse(
    result.toUIMessageStreamResponse({
      onError: () => friendlyChatError(undefined),
    }),
  );
}

function savedCards(products: unknown): ChatCatalogCard[] | null {
  if (!Array.isArray(products)) return null;
  return products.map(asCard).filter((card): card is ChatCatalogCard => card !== null);
}

// ─── Route Handler ───────────────────────────────────────────────────────────
function readableMessages(value: unknown): UIMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const messages: UIMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as { role?: unknown; parts?: unknown };
    if (typeof record.role !== "string" || !Array.isArray(record.parts)) return null;
    messages.push(item as UIMessage);
  }
  return messages;
}

export async function POST(req: Request) {
  let messages: UIMessage[];
  try {
    const body: unknown = await req.json();
    const parsed =
      body && typeof body === "object"
        ? readableMessages((body as { messages?: unknown }).messages)
        : null;
    if (!parsed) return localChatReply(CHAT_FAILURE_MESSAGE);
    messages = parsed;
  } catch {
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }

  let trimmedMessages: UIMessage[];
  try {
    trimmedMessages = trimMessages(messages);
  } catch {
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }
  const userText = lastUserText(trimmedMessages);
  if (!userText) {
    return localChatReply("");
  }

  const limit = rateLimit(`chat:${clientKey(req)}`, 12, 60_000);
  if (!limit.ok) {
    return localChatReply(CHAT_WAIT_MESSAGE);
  }
  const followUp = trimmedMessages.filter((message) => message.role === "user").length > 1;
  const noMatch = followUp ? null : await directNoMatch(userText);
  if (noMatch) return noMatch;

  const modelMessages = await convertToModelMessages(trimmedMessages);
  const tools = { searchProducts: buildSearchTool(userText, followUp) };
  const shopper = await loadShopperMatchProfile(await createSupabaseServerClient());
  const systemPrompt =
    shopper && (shopper.skinType || shopper.finish)
      ? `${SYSTEM_PROMPT}\n\nThe signed-in shopper's stored skin type is "${shopper.skinType ?? "not set"}" and finish preference is "${shopper.finish ?? "not set"}". When you call searchProducts, pass skinType and finish so matching products are preferred.`
      : SYSTEM_PROMPT;

  const shared = {
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(3),
    maxRetries: 0,
  };

  const chatKey = process.env.CHATBOT_GOOGLE_KEY?.trim() ?? "";
  const groqKey = process.env.GROQ_API_KEY?.trim() ?? "";
  const models = chatModelList();
  const primaryName = models[0] ?? "";
  const liteName = models.find((model) => model !== primaryName) ?? "";
  const google = chatKey ? createGoogleGenerativeAI({ apiKey: chatKey }) : null;
  const groq = groqKey ? createGroq({ apiKey: groqKey }) : null;

  const geminiAttempt = (model: string, label: string): ChatAttempt<Response> | null => {
    if (!google || !model) return null;
    return {
      owner: "chat",
      model,
      label,
      run: async (signal, onActivity) => {
        const errors = streamFailure();
        const result = streamText({
          ...shared,
          model: google(model),
          abortSignal: signal,
          onError: errors.onError,
          ...(usesGeminiThinkingLevel(model)
            ? {
                providerOptions: {
                  google: {
                    thinkingConfig: {
                      thinkingLevel: "low",
                      includeThoughts: false,
                    },
                  },
                },
              }
            : {}),
        });
        await readUntilOutput(result, signal, onActivity, errors.failed);
        return chatStream(result);
      },
    };
  };

  const hedge: ChatAttempt<Response> | null = groq
    ? {
        owner: "chat",
        model: "groq",
        label: `groq/${groqChatModel()}`,
        run: async (signal, onActivity) => {
          const errors = streamFailure();
          const result = streamText({
            ...shared,
            model: groq(groqChatModel()),
            abortSignal: signal,
            onError: errors.onError,
            providerOptions: {
              groq: {
                reasoningEffort: "low",
                parallelToolCalls: false,
              },
            },
          });
          await readUntilOutput(result, signal, onActivity, errors.failed);
          return chatStream(result);
        },
      }
    : null;

  const outcome = await raceChatProviders({
    primary: geminiAttempt(primaryName, `gemini/${primaryName}`),
    hedge,
    lite: geminiAttempt(liteName, `gemini/${liteName}`),
  });

  if (outcome.kind === "ok") {
    console.info(`[chat] ${outcome.label}`);
    return outcome.value;
  }
  if (outcome.kind === "bad-request") {
    console.info("[chat] bad-request");
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }

  console.info("[chat] catalog-fallback");
  const reused = savedCards(outcome.products);
  if (reused && reused.length > 0) return localChatReply(CHAT_FAILURE_MESSAGE, reused);
  return catalogFallbackReply(trimmedMessages);
}