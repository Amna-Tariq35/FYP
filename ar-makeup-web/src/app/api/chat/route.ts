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
import { asStringList } from "@/src/lib/skin-analysis/product-shape";
import { searchCatalogCards, lastUserText, type ChatCatalogCard } from "@/src/lib/chat/catalog-fallback";
import { CHAT_FAILURE_MESSAGE, CHAT_WAIT_MESSAGE, friendlyChatError } from "@/src/lib/chat/public-error";
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
const SUPABASE_RESULTS_LIMIT = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trimMessages(messages: UIMessage[]): UIMessage[] {
  const recent = messages.slice(-MAX_MESSAGES_IN_CONTEXT);
  return recent.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part, text: part.text.slice(0, MAX_MESSAGE_CHARS) } : part,
    ),
  }));
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

type ProbePart = { type: string; error?: unknown; output?: unknown };

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

async function readUntilOutput(
  result: { fullStream: AsyncIterable<ProbePart> },
  signal: AbortSignal,
  onActivity: () => void,
) {
  const iterator = result.fullStream[Symbol.asyncIterator]();
  const firstToken = AbortSignal.timeout(Math.min(CHAT_FIRST_TOKEN_MS, 10_000));
  let products: ChatCatalogCard[] | null = null;
  while (true) {
    const next = await nextProbePart(iterator, signal, firstToken);
    if (next.done) {
      if (products) return products;
      throw new Error("empty model output");
    }
    const part = next.value;
    if (part.type === "tool-result") {
      onActivity();
      const found = cardsFromToolOutput(part.output);
      if (found) products = found;
      keepStreamMoving(iterator);
      return products;
    }
    if (
      part.type === "text-delta" ||
      part.type === "tool-call" ||
      part.type === "tool-input-start" ||
      part.type === "tool-input-delta"
    ) {
      onActivity();
      keepStreamMoving(iterator);
      return products;
    }
    if (part.type === "error") {
      const error = part.error instanceof Error ? part.error : new Error("provider failed");
      throw withCatalogProducts(error, products);
    }
  }
}

function preferScore(
  row: { finish?: string | null; skin_type?: unknown },
  skinType?: string,
  finish?: string,
) {
  let score = 0;
  if (finish && typeof row.finish === "string" && row.finish.trim().toLowerCase() === finish.trim().toLowerCase()) {
    score += 2;
  }
  if (
    skinType &&
    asStringList(row.skin_type).some((value) => value.toLowerCase() === skinType.trim().toLowerCase())
  ) {
    score += 2;
  }
  return score;
}

// ─── SINGLE SMART TOOL: For Both Makeup & Skincare ───────────────────────────
const searchProducts = tool({
  description:
    "Fetch makeup AND skincare products from the unified database catalog based on user preferences.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        "e.g. foundation, lipstick, cleanser, moisturizer, sunscreen, eye cream"
      ),
    skinType: z
      .string()
      .optional()
      .describe("e.g. Oily, Dry, Combination, Normal"),
    itemForm: z
      .string()
      .optional()
      .describe("e.g. Liquid, Powder, Stick, Cream, Serum"),
    tags: z
      .string()
      .optional()
      .describe(
        "e.g. acne, hydrating, matte, anti-aging, vegan (matches with DB tags)"
      ),
    colorFamily: z
      .string()
      .optional()
      .describe("e.g. Red, Pink, Nude (Mostly for makeup)"),
    undertone: z.string().optional().describe("e.g. Warm, Cool, Neutral"),
    finish: z
      .string()
      .optional()
      .describe("e.g. matte, dewy, satin. Prefer products with this finish."),
  }),
  execute: async ({
    category,
    skinType,
    itemForm,
    tags,
    colorFamily,
    undertone,
    finish,
  }) => {
    try {
      const supabase = await createSupabaseServerClient();
      const stored = await loadShopperMatchProfile(supabase);
      const preferredSkin = skinType || stored?.skinType || undefined;
      const preferredFinish = finish || stored?.finish || undefined;

      let query = supabase
        .from("makeup_products")
        .select(
          "id, product_key, name, brand, category, price, image_url, finish, skin_type, product_shades(id, shade_name, color_family, skin_tone, undertone, shade_hex)"
        )
        .eq("is_active", true)
        .limit(SUPABASE_RESULTS_LIMIT);

      if (category) query = query.ilike("category", `%${category}%`);
      if (skinType) query = query.ilike("skin_type", `%${skinType}%`);
      if (itemForm) query = query.ilike("item_form", `%${itemForm}%`);
      if (tags) query = query.ilike("tags", `%${tags}%`);

      if (colorFamily)
        query = query.ilike("product_shades.color_family", `%${colorFamily}%`);
      if (undertone)
        query = query.ilike("product_shades.undertone", `%${undertone}%`);

      const { data, error } = await query;

      if (error) {
        console.error("[searchProducts] Supabase error:", error.message);
        return {
          success: false,
          products: [],
          message: "Database error occurred.",
        };
      }

      const products = (data ?? [])
        .filter((row) => typeof row.product_key === "string" && row.product_key.length > 0)
        .sort((a, b) => preferScore(b, preferredSkin, preferredFinish) - preferScore(a, preferredSkin, preferredFinish));

      if (products.length === 0) {
        return {
          success: true,
          products: [],
          message: "No matching products found.",
        };
      }

      return { success: true, products, message: "" };
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

// ─── System Prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a shopping guide for this store's makeup and skincare catalog.
You help people choose products. You are not a dermatologist, and you do not diagnose skin conditions or give clinical treatment advice.

STRICT RULES:
1. ALWAYS call the 'searchProducts' tool before answering product-related questions.
2. Extract context: If they say "I have acne and need a face wash", category="cleanser", tags="acne". If they want "red lipstick", category="lipstick", colorFamily="Red".
3. NEVER list plain text product IDs, database ids, or raw data. Product cards are rendered from tool results and must be identified only by product_key.
4. Keep your response conversational and short (1-2 sentences).
5. If someone asks for a medical diagnosis or treatment plan, say you can only help them shop for products.

FALLBACK RULE:
If the tool returns 0 products, DO NOT hallucinate products. Reply gracefully with:
"I couldn't find an exact match for that right now. Could we try looking for a different category or preference?"`;

function chatStream(result: { toUIMessageStreamResponse: (init?: { onError?: (error: unknown) => string }) => Response }) {
  return result.toUIMessageStreamResponse({
    onError: () => friendlyChatError(undefined),
  });
}

function savedCards(products: unknown): ChatCatalogCard[] | null {
  if (!Array.isArray(products)) return null;
  return products.map(asCard).filter((card): card is ChatCatalogCard => card !== null);
}

// ─── Route Handler ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const limit = rateLimit(`chat:${clientKey(req)}`, 12, 60_000);
  if (!limit.ok) {
    return localChatReply(CHAT_WAIT_MESSAGE);
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return localChatReply(CHAT_FAILURE_MESSAGE);
    }
  } catch {
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }

  const trimmedMessages = trimMessages(messages);
  if (!lastUserText(trimmedMessages)) {
    return localChatReply("");
  }

  const modelMessages = await convertToModelMessages(trimmedMessages);
  const tools = { searchProducts };
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
        const result = streamText({
          ...shared,
          model: google(model),
          abortSignal: signal,
          onError: () => {},
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
        await readUntilOutput(result, signal, onActivity);
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
          const result = streamText({
            ...shared,
            model: groq(groqChatModel()),
            abortSignal: signal,
            onError: () => {},
            providerOptions: {
              groq: {
                reasoningEffort: "low",
                parallelToolCalls: false,
              },
            },
          });
          await readUntilOutput(result, signal, onActivity);
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
  if (reused) return localChatReply(CHAT_FAILURE_MESSAGE, reused);
  return catalogFallbackReply(trimmedMessages);
}