import {
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

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGES_IN_CONTEXT = 10;
const SUPABASE_RESULTS_LIMIT = 5;

// ─── Provider Clients ────────────────────────────────────────────────────────
const google = createGoogleGenerativeAI({
  apiKey: process.env.CHATBOT_GOOGLE_KEY ||"",
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trimMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES_IN_CONTEXT) return messages;
  return messages.slice(-MAX_MESSAGES_IN_CONTEXT);
}

function buildErrorResponse(
  code: "RATE_LIMIT" | "SERVER_ERROR" | "BAD_REQUEST",
  message: string,
  status: number,
  retryAfterSeconds = 0
): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
      retryAfter: retryAfterSeconds,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
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
  }),
  execute: async ({
    category,
    skinType,
    itemForm,
    tags,
    colorFamily,
    undertone,
  }) => {
    try {
      const supabase = await createSupabaseServerClient();

      let query = supabase
        .from("makeup_products")
        .select(
          "id, product_key, name, brand, category, price, image_url, product_shades(id, shade_name, color_family, skin_tone, undertone, shade_hex)"
        )
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

      if (!data || data.length === 0) {
        return {
          success: true,
          products: [],
          message: "No matching products found.",
        };
      }

      return { success: true, products: data, message: "" };
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
const SYSTEM_PROMPT = `You are a premium AI Beauty & Clinical Skincare Assistant. 
You are an expert in both Color Cosmetics (Makeup) and Dermatology (Skincare).

STRICT RULES:
1. ALWAYS call the 'searchProducts' tool before answering product-related questions.
2. Extract context: If they say "I have acne and need a face wash", category="cleanser", tags="acne". If they want "red lipstick", category="lipstick", colorFamily="Red".
3. NEVER list plain text product IDs or raw data. The UI will render the product cards automatically based on your tool call.
4. Keep your response conversational, empathetic, and short (1-2 sentences). 

FALLBACK RULE:
If the tool returns 0 products, DO NOT hallucinate products. Reply gracefully with:
"I couldn't find an exact match for that right now. 😔 Could we try looking for a different category or adjusting your skin type?"`;

// ─── Route Handler (Gemini First -> Groq Fallback) ──────────────────────────
export async function POST(req: Request) {
  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return buildErrorResponse("BAD_REQUEST", "Messages array is required.", 400);
    }
  } catch {
    return buildErrorResponse("BAD_REQUEST", "Invalid JSON payload.", 400);
  }

  const trimmedMessages = trimMessages(messages);
  const modelMessages = await convertToModelMessages(trimmedMessages);
  const tools = { searchProducts };

  let isGeminiQuotaExceeded = false;

  // 1. ATTEMPT GEMINI FIRST
  try {
    console.log("Attempting Chat with Gemini...");
    const result = streamText({
      model: google("gemini-3.5-flash"),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(3),
    });

    return result.toUIMessageStreamResponse();
  } catch (geminiErr: any) {
    console.warn("Gemini failed. Attempting Groq fallback...", geminiErr?.message || geminiErr);

    if (
      geminiErr?.status === 429 ||
      geminiErr?.message?.includes("quota") ||
      geminiErr?.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      isGeminiQuotaExceeded = true;
    }

    // 2. FALLBACK TO GROQ
    try {
      console.log("Attempting Chat with Groq Fallback...");
      const result = streamText({
        model: groq("qwen-3.6-27b"),
        system: SYSTEM_PROMPT,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(3),
        providerOptions: {
          groq: { parallel_tool_calls: false },
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (groqErr: any) {
      console.error("[chat/route] All AI Providers Failed:", groqErr?.message || groqErr);

      const isGroqQuotaExceeded =
        groqErr?.status === 429 ||
        groqErr?.message?.includes("rate") ||
        groqErr?.message?.includes("quota");

      // Categorized Error Responses
      if (isGeminiQuotaExceeded || isGroqQuotaExceeded) {
        return buildErrorResponse(
          "RATE_LIMIT",
          "High traffic detected. Please wait a few seconds before retrying.",
          429,
          10
        );
      }

      return buildErrorResponse(
        "SERVER_ERROR",
        "AI Assistant is currently undergoing quick maintenance. Please try again in a moment.",
        503
      );
    }
  }
}