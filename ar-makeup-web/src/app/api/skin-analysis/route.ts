import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import {
  CANONICAL_CONCERNS,
  MAX_IMAGE_BASE64_CHARS,
  QuestionnaireInputSchema,
  SKIN_TYPES,
  type AnalysisConcern,
  type ConcernScoresV2,
  concernScoreMap,
  isSkinType,
  normalizeConcernScores,
} from "@/src/lib/skin-analysis/contract";
import { mapFaceppSkinResult } from "@/src/lib/skin-analysis/facepp-mapper";
import { clientKey, rateLimit } from "@/src/lib/skin-analysis/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const DRY_VS_NORMAL_QUESTION =
  "After washing your face, before applying any moisturizer, does your skin feel tight, rough, or slightly uncomfortable?";

const GeminiSchema = z.object({
  skinType: z.enum(SKIN_TYPES),
  mainConcerns: z.array(z.enum(CANONICAL_CONCERNS)).max(5),
  visionSummary: z.string().max(500),
});

function publicError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  return work(signal);
}

function ownsLog(logUserId: string | null, requesterId: string | null) {
  if (!logUserId) return true;
  return Boolean(requesterId) && logUserId === requesterId;
}

async function saveProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  skinType: string,
  concerns: string[],
  allergies?: string[],
) {
  await supabase.from("user_skin_profiles").upsert(
    {
      user_id: userId,
      skin_type: skinType,
      concerns,
      ...(allergies ? { allergies } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function POST(req: Request) {
  try {
    const limit = rateLimit(`skin:${clientKey(req)}`, 10, 60_000);
    if (!limit.ok) {
      return publicError("Too many analysis requests. Please wait a minute and try again.", 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return publicError("Invalid request.", 400);
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (body.confirmDrySkin === true && typeof body.sessionId === "string") {
      const logs = createSupabaseAdminClient();
      const { data: existing, error: fetchError } = await logs
        .from("skin_analysis_logs")
        .select("user_id, concern_scores, skin_type")
        .eq("id", body.sessionId)
        .maybeSingle();

      if (fetchError || !existing) {
        return publicError("We could not find that analysis.", 404);
      }
      if (!ownsLog(existing.user_id, user?.id ?? null)) {
        return publicError("We could not find that analysis.", 404);
      }

      const current = normalizeConcernScores(existing.concern_scores, "photo");
      const concerns = [...current.concerns];
      for (const tag of ["dryness", "dehydration"] as const) {
        if (!concerns.some((c) => c.tag === tag)) {
          concerns.push({ tag, severity: 0.7, source: "confirmation" });
        }
      }
      const nextScores: ConcernScoresV2 = {
        ...current,
        concerns,
        main_concerns: concerns.map((c) => c.tag),
        severity_scores: concernScoreMap({ concerns }),
      };

      const { error: updateError } = await logs
        .from("skin_analysis_logs")
        .update({
          skin_type: "Dry",
          concern_scores: nextScores,
          routine_snapshot: null,
          ai_summary:
            "You confirmed tightness after washing, so this profile is now dry. Your routine will be rebuilt for that.",
        })
        .eq("id", body.sessionId);

      if (updateError) {
        return publicError("We could not update this profile. Please try again.", 500);
      }

      if (user?.id) {
        await saveProfile(supabase, user.id, "Dry", nextScores.main_concerns, nextScores.allergies);
      }

      return NextResponse.json({
        sessionId: body.sessionId,
        userSkinType: "Dry",
        mainConcerns: nextScores.main_concerns,
        summary:
          "You confirmed tightness after washing, so this profile is now dry. Your routine will be rebuilt for that.",
        routineStale: true,
      });
    }

    const method = body.method === "questionnaire" ? "questionnaire" : "photo";

    if (method === "questionnaire") {
      const parsed = QuestionnaireInputSchema.safeParse({
        method: "questionnaire",
        skinType: body.skinType,
        mainConcerns: body.mainConcerns ?? [],
        concernScores: body.concernScores,
        allergies: body.allergies,
        pregnant: body.pregnant,
      });
      if (!parsed.success) {
        return publicError("Please check your skin type and concerns, then try again.", 400);
      }

      const input = parsed.data;
      const concerns: AnalysisConcern[] = input.mainConcerns.map((tag) => ({
        tag,
        severity: input.concernScores?.[tag] ?? 0.5,
        source: "questionnaire" as const,
      }));
      const scores: ConcernScoresV2 = {
        version: 2,
        main_concerns: concerns.map((c) => c.tag),
        concerns,
        severity_scores: concernScoreMap({ concerns }),
        engine: "questionnaire",
        confidence: "high",
        heuristics: null,
        allergies: input.allergies ?? [],
        pregnant: input.pregnant === true,
      };
      const summary = `Based on your answers, this profile is ${input.skinType.toLowerCase()}${
        concerns.length ? `, focused on ${concerns.map((c) => c.tag).join(", ")}` : ""
      }. This is a product-matching guide, not a medical diagnosis.`;

      const saved = await insertLog(user?.id ?? null, {
        method,
        skinType: input.skinType,
        scores,
        summary,
      });
      if (!saved.ok) return publicError(saved.message, 500);
      if (user?.id) {
        await saveProfile(supabase, user.id, input.skinType, scores.main_concerns, scores.allergies);
      }
      return NextResponse.json({
        sessionId: saved.id,
        userSkinType: input.skinType,
        mainConcerns: scores.main_concerns,
        summary,
        engine: "questionnaire",
        confidence: "high",
        needsSkinTypeConfirmation: false,
        confirmationQuestion: null,
      });
    }

    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return publicError("That photo is missing or too large. Please retake it.", 400);
    }
    const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const mediaPipeData =
      body.mediaPipeData && typeof body.mediaPipeData === "object"
        ? (body.mediaPipeData as Record<string, unknown>)
        : null;
    const cvRedness = Number(
      (mediaPipeData?.metrics as { redness?: number } | undefined)?.redness ?? 0,
    );

    let facepp: EngineOutcome | null = null;
    try {
      facepp = await analyzeWithFacepp(cleanBase64, cvRedness);
    } catch (error) {
      if (error instanceof Error && error.message === "FACE_NOT_CLEAR") {
        return publicError(
          "Face not detected clearly. Please use a straight, well-lit, front-facing photo.",
          400,
        );
      }
      facepp = null;
    }
    let outcome = facepp;

    if (!outcome) {
      outcome = await analyzeWithGemini(cleanBase64, mediaPipeData);
    }

    if (!outcome) {
      return NextResponse.json(
        {
          success: false,
          error: "PHOTO_ANALYSIS_UNAVAILABLE",
          message:
            "Photo analysis is busy right now. You can try again in a moment, or answer the short questionnaire for a result that does not depend on the photo service.",
          suggestQuestionnaire: true,
        },
        { status: 503 },
      );
    }

    const heuristics =
      mediaPipeData && typeof mediaPipeData.overallScore === "number"
        ? {
            overallScore: mediaPipeData.overallScore as number,
            metrics: (mediaPipeData.metrics as Record<string, number>) || undefined,
            regionBreakdown:
              (mediaPipeData.regionBreakdown as Record<string, unknown>) || undefined,
          }
        : null;

    const scores: ConcernScoresV2 = {
      version: 2,
      main_concerns: outcome.concerns.map((c) => c.tag),
      concerns: outcome.concerns,
      severity_scores: concernScoreMap({ concerns: outcome.concerns }),
      engine: outcome.engine,
      confidence: outcome.confidence,
      heuristics,
      allergies: [],
      pregnant: false,
    };

    if (!isSkinType(outcome.skinType)) {
      return publicError("The analysis result could not be saved. Please try another photo.", 422);
    }

    const saved = await insertLog(user?.id ?? null, {
      method: "photo",
      skinType: outcome.skinType,
      scores,
      summary: outcome.summary,
    });
    if (!saved.ok) return publicError(saved.message, 500);
    if (user?.id) {
      await saveProfile(supabase, user.id, outcome.skinType, scores.main_concerns);
    }

    return NextResponse.json({
      sessionId: saved.id,
      userSkinType: outcome.skinType,
      mainConcerns: scores.main_concerns,
      summary: outcome.summary,
      engine: outcome.engine,
      confidence: outcome.confidence,
      needsSkinTypeConfirmation: outcome.needsSkinTypeConfirmation,
      confirmationQuestion: outcome.needsSkinTypeConfirmation ? DRY_VS_NORMAL_QUESTION : null,
    });
  } catch (error) {
    console.error("skin-analysis error:", error);
    return publicError("Something went wrong while analyzing. Please try again.", 500);
  }
}

async function insertLog(
  userId: string | null,
  payload: { method: string; skinType: string; scores: ConcernScoresV2; summary: string },
) {
  const logs = createSupabaseAdminClient();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await logs
      .from("skin_analysis_logs")
      .insert({
        user_id: userId,
        method: payload.method,
        image_url: null,
        skin_type: payload.skinType,
        concern_scores: payload.scores,
        ai_summary: payload.summary,
        routine_snapshot: null,
      })
      .select("id")
      .single();
    if (!error && data?.id) return { ok: true as const, id: data.id as string };
    console.error("skin log insert failed:", error);
  }
  return { ok: false as const, message: "We could not save this analysis. Please try again." };
}

type EngineOutcome = {
  skinType: string;
  concerns: AnalysisConcern[];
  summary: string;
  needsSkinTypeConfirmation: boolean;
  confidence: "high" | "medium" | "low";
  engine: "facepp" | "gemini";
};

async function analyzeWithFacepp(cleanBase64: string, cvRedness: number): Promise<EngineOutcome | null> {
  const faceppKey = process.env.FACEPP_API_KEY;
  const faceppSecret = process.env.FACEPP_API_SECRET;
  if (!faceppKey || !faceppSecret) return null;

  let lastWasImage = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const formData = new FormData();
      formData.append("api_key", faceppKey);
      formData.append("api_secret", faceppSecret);
      formData.append("image_base64", cleanBase64);
      const response = await withTimeout(
        (signal) =>
          fetch("https://api-us.faceplusplus.com/facepp/v1/skinanalyze", {
            method: "POST",
            body: formData,
            signal,
          }),
        12_000,
      );
      const data = await response.json();
      if (!response.ok || data.error_message) {
        const message = String(data.error_message || "Face++ failed");
        lastWasImage =
          message.includes("INVALID_IMAGE") ||
          message.includes("NO_FACE") ||
          message.includes("IMAGE_FILE");
        if (lastWasImage) break;
        throw new Error(message);
      }
      const mapped = mapFaceppSkinResult(data.result, cvRedness);
      return { ...mapped, engine: "facepp" };
    } catch (error) {
      console.warn(`Face++ attempt ${attempt} failed`, error);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  if (lastWasImage) {
    throw Object.assign(new Error("FACE_NOT_CLEAR"), { imageQuality: true });
  }
  return null;
}

async function analyzeWithGemini(
  cleanBase64: string,
  mediaPipeData: Record<string, unknown> | null,
): Promise<EngineOutcome | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  try {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    const modelName = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
    const { object } = await withTimeout(
      () =>
        generateObject({
          model: google(modelName),
          schema: GeminiSchema,
          temperature: 0,
          abortSignal: AbortSignal.timeout(15_000),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Estimate a skincare product profile from this face photo. Use only the schema enums. Do not invent medical conditions. Supporting measurements (estimates, not a diagnosis): ${JSON.stringify(
                    mediaPipeData?.metrics ?? {},
                  )}`,
                },
                { type: "image", image: Buffer.from(cleanBase64, "base64") },
              ],
            },
          ],
        }),
      18_000,
    );
    const concerns: AnalysisConcern[] = object.mainConcerns.map((tag) => ({
      tag,
      severity: 0.65,
      source: "gemini" as const,
    }));
    return {
      skinType: object.skinType,
      concerns,
      summary: object.visionSummary,
      needsSkinTypeConfirmation: object.skinType === "Normal",
      confidence: "medium",
      engine: "gemini",
    };
  } catch (error) {
    console.warn("Gemini vision fallback failed", error);
    return null;
  }
}
