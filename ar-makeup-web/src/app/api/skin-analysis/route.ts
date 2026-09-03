import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
// Groq import kept for the disabled fallback function below — see note there.
import Groq from "groq-sdk";
import { z } from "zod";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

// ─── EXACT DATABASE ENUMS & TAGS MAPPING ───────────────────────────────
const VALID_SKIN_TYPES = [
  "Acne-Prone",
  "All",
  "All Skin Types",
  "Combination",
  "Dehydrated",
  "Dry",
  "Normal",
  "Oily",
  "Sensitive",
] as const;

export const VALID_TAGS = [
  "acne",
  "Acne Prone",
  "allergy_tested",
  "anti-aging",
  "Anti-Aging",
  "brightening",
  "calming",
  "Cleanser",
  "Daily Care",
  "damaged barrier",
  "dark spots",
  "Dark Spots & Brightening",
  "dehydration",
  "dryness",
  "dullness",
  "Exfoliating / Texture",
  "Eye cream",
  "fast-absorbing",
  "glow",
  "hydration",
  "Hydrating",
  "hyperpigmentation",
  "invisible",
  "irritation",
  "lightweight",
  "lightweight-hydration",
  "long_wear",
  "mineral",
  "Moisturizer",
  "oil-free",
  "plumping",
  "pollution",
  "redness",
  "Redness & Soothing",
  "rosacea",
  "sensitive_friendly",
  "soothing",
  "sun-damage",
  "Treatment",
  "vegan",
  "water-based",
] as const;

const AnalysisSchema = z.object({
  skinType: z.enum(VALID_SKIN_TYPES),
  mainConcerns: z.array(z.enum(VALID_TAGS)).min(1).max(25),
  visionSummary: z.string(),
});

// The single question used to disambiguate Face++'s "Normal" result, since
// real test data showed Face++'s own confidence score does NOT reliably
// separate correct Normal calls from misclassified Dry skin (82% confidence
// on a wrong call, 95% on a right one — no usable cutoff). So instead of
// trying to guess from confidence, we always ask this once when the result
// lands on Normal. It's the standard "post-cleansing tightness" proxy used
// in dermatology-informed skin-type self-assessments.
const DRY_VS_NORMAL_QUESTION =
  "After washing your face, before applying any moisturizer, does your skin feel tight, rough, or slightly uncomfortable?";

async function insertOrUpdateAfterAnalysis(
  supabase: any,
  userId: string | null,
  payload: {
    method: string;
    imageUrl: string | null;
    skinType: string;
    finalScoresForDB: any;
    aiSummary: string;
  },
) {
  const { data: dbData, error: dbError } = await supabase
    .from("skin_analysis_logs")
    .insert({
      user_id: userId,
      method: payload.method,
      image_url: payload.imageUrl,
      skin_type: payload.skinType,
      concern_scores: payload.finalScoresForDB,
      ai_summary: payload.aiSummary,
      routine_snapshot: null,
    })
    .select("id")
    .single();

  if (dbError) throw new Error(`Database Insert Error: ${dbError.message}`);
  return dbData;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ====================================================================
    // BRANCH 0: DRY-SKIN CONFIRMATION FINALIZER
    // Fired when the frontend asked DRY_VS_NORMAL_QUESTION after a "Normal"
    // result and the user answered "yes" (skin feels tight/rough). Updates
    // the existing session in place instead of re-running the whole pipeline.
    // ====================================================================
    if (body.confirmDrySkin === true && body.sessionId) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: existing, error: fetchError } = await supabase
        .from("skin_analysis_logs")
        .select("concern_scores")
        .eq("id", body.sessionId)
        .single();

      if (fetchError) {
        throw new Error(`Could not load session to update: ${fetchError.message}`);
      }

      const existingConcerns: string[] =
        existing?.concern_scores?.main_concerns || [];
      const dryTags = [
        "dryness",
        "dehydration",
        "hydration",
        "Hydrating",
        "water-based",
        "lightweight-hydration",
      ];
      const updatedConcerns = [...new Set([...existingConcerns, ...dryTags])];

      const { error: updateError } = await supabase
        .from("skin_analysis_logs")
        .update({
          skin_type: "Dry",
          concern_scores: {
            ...(existing?.concern_scores || {}),
            main_concerns: updatedConcerns,
          },
        })
        .eq("id", body.sessionId);

      if (updateError) {
        throw new Error(`Could not update session: ${updateError.message}`);
      }

      if (user?.id) {
        await supabase.from("user_skin_profiles").upsert(
          {
            user_id: user.id,
            skin_type: "Dry",
            concerns: updatedConcerns,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      }

      return NextResponse.json(
        {
          sessionId: body.sessionId,
          userSkinType: "Dry",
          mainConcerns: updatedConcerns,
          summary:
            "Thanks for confirming — we've updated your profile to a dry skin type and adjusted your recommendations accordingly.",
        },
        { status: 200 },
      );
    }

    const {
      imageBase64,
      imageUrl,
      method,
      mediaPipeData,
      skinType,
      mainConcerns,
      concernScores,
    } = body;

    const validMethod = method === "questionnaire" ? "questionnaire" : "photo";

    let finalSkinType = "Normal";
    let finalConcerns: string[] = ["Overall Skin Maintenance"];
    let aiSummary =
      "Based on the scan, your skin appears balanced. We have tailored a routine for overall maintenance.";
    let finalScoresForDB: any = null;
    let engineUsed: "facepp" | "gemini" | "none" = "none";

    // ====================================================================
    // BRANCH 1: QUESTIONNAIRE FLOW (Bypass AI Vision completely)
    // ====================================================================
    if (validMethod === "questionnaire") {
      console.log("📝 Processing Questionnaire Data...");

      finalSkinType = skinType || "Normal";
      finalConcerns =
        mainConcerns && mainConcerns.length > 0
          ? mainConcerns.slice(0, 5)
          : ["Daily Care"];

      aiSummary = `Based on your self-assessment, you have a ${finalSkinType.toLowerCase()} skin profile. We have tailored this routine specifically to target your primary concerns, including ${finalConcerns.join(" and ")}.`;

      finalScoresForDB = {
        main_concerns: finalConcerns,
        severity_scores: concernScores || {},
      };
    }
    // ====================================================================
    // BRANCH 2: PHOTO FLOW (Primary: Face++ with retry, Fallback: Gemini)
    // ====================================================================
    else {
      let aiResult: z.infer<typeof AnalysisSchema> | null = null;
      let needsSkinTypeConfirmation = false;

      const cleanBase64 = imageBase64?.includes(",")
        ? imageBase64.split(",")[1]
        : imageBase64;
      const faceppKey = process.env.FACEPP_API_KEY;
      const faceppSecret = process.env.FACEPP_API_SECRET;

      if (faceppKey && faceppSecret && cleanBase64) {
        // RETRY LOGIC: Face++ works ~90% of the time; most remaining
        // failures are transient (server load), not bad input. One retry
        // with a short delay resolves many of these without ever touching
        // Gemini's very limited quota. Image-quality errors (no face, bad
        // size) are NOT retried — retrying won't fix a bad photo.
        const maxAttempts = 2;
        let lastError: any = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(
              `📸 Attempting Face++ Skin Analyze API... (attempt ${attempt}/${maxAttempts})`,
            );

            const formData = new FormData();
            formData.append("api_key", faceppKey);
            formData.append("api_secret", faceppSecret);
            formData.append("image_base64", cleanBase64);

            const faceppRes = await fetch(
              "https://api-us.faceplusplus.com/facepp/v1/skinanalyze",
              { method: "POST", body: formData },
            );

            const faceppData = await faceppRes.json();

            if (!faceppRes.ok || faceppData.error_message) {
              throw new Error(
                faceppData.error_message || "Face++ Request Failed",
              );
            }

            const result = faceppData.result;

            console.log("-----------------------------------------");
            console.log(
              "🔍 RAW result.skin_type Object:",
              JSON.stringify(result.skin_type, null, 2),
            );
            console.log("-----------------------------------------");

            // 1️⃣ SKIN TYPE EVALUATION
            let mappedSkinType = "Normal";
            const skinTypeIndex = result.skin_type?.skin_type;
            if (skinTypeIndex === 0) mappedSkinType = "Oily";
            else if (skinTypeIndex === 1) mappedSkinType = "Dry";
            else if (skinTypeIndex === 3) mappedSkinType = "Combination";
            // skinTypeIndex === 2 -> stays "Normal"
            //
            // NOTE: tested using v3's own oiliness metric as a Normal-vs-Dry
            // tie-breaker here — data showed it's NOT reliable (a confirmed
            // oily photo scored oiliness=14, a confirmed dry/flaky photo
            // scored oiliness=27 — backwards). Deliberately not used.
            // Disambiguation is instead handled via DRY_VS_NORMAL_QUESTION
            // below, asked to the user rather than guessed from pixels.

            const isFlagged = (
              field: { value?: string | number; confidence?: number } | undefined,
              threshold = 0.5,
            ) => {
              if (!field) return false;
              const level =
                typeof field.value === "number"
                  ? field.value
                  : parseInt(field.value ?? "0", 10);
              return level === 1 && (field.confidence ?? 0) > threshold;
            };

            const expandedTags = new Set<string>();
            const summaryLabels: string[] = [];

            // 2️⃣ WRINKLES -> ANTI-AGING EXPANSION
            const wrinkleFields = [
              "forehead_wrinkle",
              "crows_feet",
              "eye_finelines",
              "glabella_wrinkle",
              "nasolabial_fold",
            ];
            const flaggedWrinkleCount = wrinkleFields.filter((field) =>
              isFlagged(result[field]),
            ).length;
            if (flaggedWrinkleCount >= 2) {
              summaryLabels.push("fine lines and wrinkles");
              expandedTags.add("anti-aging");
              expandedTags.add("plumping");
            }

            // 3️⃣ DARK CIRCLES -> DULLNESS EXPANSION
            if (isFlagged(result.dark_circle)) {
              summaryLabels.push("skin dullness");
              expandedTags.add("dullness");
              expandedTags.add("glow");
            }

            // 4️⃣ SKIN SPOT -> PIGMENTATION EXPANSION
            if (isFlagged(result.skin_spot)) {
              summaryLabels.push("dark spots and pigmentation");
              expandedTags.add("dark spots");
              expandedTags.add("hyperpigmentation");
              expandedTags.add("Dark Spots & Brightening");
              expandedTags.add("brightening");
            }

            // 5️⃣ ACNE EXPANSION
            const hasAcne = isFlagged(result.acne);
            if (hasAcne) {
              summaryLabels.push("acne breakouts");
              expandedTags.add("acne");
              expandedTags.add("Acne Prone");
            }

            // 6️⃣ PORES & BLACKHEADS -> TEXTURE EXPANSION
            const hasBlackhead = isFlagged(result.blackhead);
            const poreRegions = [
              "pores_forehead",
              "pores_left_cheek",
              "pores_right_cheek",
              "pores_jaw",
            ];
            const hasPores = poreRegions.some((region) =>
              isFlagged(result[region]),
            );
            if (hasBlackhead || hasPores) {
              summaryLabels.push("uneven skin texture");
              expandedTags.add("Exfoliating / Texture");
            }

            // 7️⃣ REDNESS / IRRITATION -> SOOTHING EXPANSION
            // Fixed field path + scale (see earlier fix): v3's redness
            // lives at mediaPipeData.metrics.redness on a 0-100 scale.
            const cvRednessScore: number = mediaPipeData?.metrics?.redness ?? 0;
            const hasRedness = cvRednessScore > 58;
            const isSensitive = cvRednessScore > 65;

            if (hasRedness) {
              summaryLabels.push("redness and sensitivity");
              expandedTags.add("redness");
              expandedTags.add("irritation");
              expandedTags.add("Redness & Soothing");
              expandedTags.add("soothing");
              expandedTags.add("calming");
              expandedTags.add("sensitive_friendly");
            }

            // 8️⃣ DRYNESS -> HYDRATION EXPANSION
            if (mappedSkinType === "Dry") {
              summaryLabels.push("dryness and dehydration");
              expandedTags.add("dryness");
              expandedTags.add("dehydration");
              expandedTags.add("hydration");
              expandedTags.add("Hydrating");
              expandedTags.add("water-based");
              expandedTags.add("lightweight-hydration");
            }

            // 9️⃣ SKIN TYPE OVERRIDES (Sensitive > Acne-Prone > base)
            if (isSensitive) mappedSkinType = "Sensitive";
            else if (hasAcne && (hasPores || hasBlackhead))
              mappedSkinType = "Acne-Prone";

            if (expandedTags.size === 0) {
              expandedTags.add("Daily Care");
              summaryLabels.push("overall daily maintenance");
            }

            // Ask the disambiguation question whenever the FINAL type is
            // still Normal (i.e. neither override fired) — confidence isn't
            // a reliable gate here, per the note above.
            if (mappedSkinType === "Normal") {
              needsSkinTypeConfirmation = true;
            }

            aiResult = {
              skinType: mappedSkinType as any,
              mainConcerns: Array.from(expandedTags) as any,
              visionSummary: `Based on our clinical AI scan, you have a ${mappedSkinType.toLowerCase()} skin profile. We detected areas requiring attention, specifically targeting ${summaryLabels.slice(0, 3).join(", ")}.`,
            };

            console.log(
              "✅ Face++ Analysis Successful! Expanded Tags:",
              Array.from(expandedTags),
            );
            engineUsed = "facepp";
            lastError = null;
            break; // success — stop retrying
          } catch (faceppError: any) {
            lastError = faceppError;
            const errMsg =
              faceppError?.message || faceppError?.toString() || "";

            const isImageQualityError =
              errMsg.includes("INVALID_IMAGE_FACE") ||
              errMsg.includes("NO_FACE_FOUND") ||
              errMsg.includes("IMAGE_FILE_TOO_LARGE") ||
              errMsg.includes("INVALID_IMAGE_SIZE");

            if (isImageQualityError) {
              return NextResponse.json(
                {
                  success: false,
                  error:
                    "Face not detected clearly. Please upload a straight, well-lit, front-facing photo.",
                },
                { status: 400 },
              );
            }

            console.warn(
              `⚠️ Face++ attempt ${attempt}/${maxAttempts} failed:`,
              errMsg,
            );

            if (attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 1200)); // brief backoff before retry
            }
          }
        }

        if (lastError && !aiResult) {
          console.warn(
            "⚠️ Face++ failed after retries, falling back to Gemini...",
            lastError?.message,
          );
        }
      }

      // 🟡 ATTEMPT 2: GEMINI VISION (Fallback — best-effort, quota is tight)
      const geminiKey = process.env.GEMINI_API_KEY;

      if (!aiResult && geminiKey) {
        try {
          console.log("📸 Attempting Hybrid Analysis with Gemini Vision...");
          const google = createGoogleGenerativeAI({ apiKey: geminiKey });
          const imageBuffer = cleanBase64
            ? Buffer.from(cleanBase64, "base64")
            : null;

          const { object } = await generateObject({
            model: google("gemini-3.5-flash"),
            schema: AnalysisSchema,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this facial image along with the provided MediaPipe heuristic data: ${JSON.stringify(
                      mediaPipeData || {},
                    )}. Strictly map the results to the provided schema enums.`,
                  },
                  ...(imageBuffer
                    ? [{ type: "image" as const, image: imageBuffer }]
                    : []),
                ],
              },
            ],
          });

          aiResult = object as z.infer<typeof AnalysisSchema>;
          if (aiResult.skinType === "Normal") needsSkinTypeConfirmation = true;
          console.log("✅ Gemini Analysis Successful");
          engineUsed = "gemini";
        } catch (geminiError: any) {
          console.warn(
            "⚠️ Gemini Vision failed or quota exceeded:",
            geminiError?.message || geminiError,
          );
        }
      }

      // ❌ BOTH ENGINES FAILED — do NOT silently guess from unvalidated
      // heuristic numbers (this is where Groq used to sit). Producing a
      // confident-looking result from data we've already shown to be
      // unreliable is worse than telling the user plainly. Suggest the
      // questionnaire instead, which gives an equally usable result with
      // no risk of a wrong "clinical" report.
      if (!aiResult) {
        return NextResponse.json(
          {
            success: false,
            error: "PHOTO_ANALYSIS_UNAVAILABLE",
            message:
              "Photo analysis is temporarily busy. You can try again in a moment, or fill out our quick skin questionnaire instead for an instant result.",
            suggestQuestionnaire: true,
          },
          { status: 503 },
        );
      }

      finalSkinType = aiResult.skinType;
      finalConcerns = aiResult.mainConcerns;
      aiSummary = aiResult.visionSummary;

      finalScoresForDB = {
        main_concerns: finalConcerns,
        heuristics: mediaPipeData || null,
      };

      // ─── SUPABASE DB INSERTION (photo branch) ─────────────
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const dbData = await insertOrUpdateAfterAnalysis(supabase, user?.id || null, {
        method: validMethod,
        imageUrl: imageUrl || null,
        skinType: finalSkinType,
        finalScoresForDB,
        aiSummary,
      });

      if (user?.id) {
        await supabase.from("user_skin_profiles").upsert(
          {
            user_id: user.id,
            skin_type: finalSkinType,
            concerns: finalConcerns,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      }

      return NextResponse.json(
        {
          sessionId: dbData.id,
          userSkinType: finalSkinType,
          mainConcerns: finalConcerns,
          summary: aiSummary,
          _debugSource: engineUsed,
          // Frontend: if true, show DRY_VS_NORMAL_QUESTION as a quick
          // Yes/No prompt. On "Yes", call this same endpoint again with
          // { confirmDrySkin: true, sessionId } to finalize as Dry.
          needsSkinTypeConfirmation,
          confirmationQuestion: needsSkinTypeConfirmation
            ? DRY_VS_NORMAL_QUESTION
            : null,
        },
        { status: 200 },
      );
    }

    // ─── SUPABASE DB INSERTION (questionnaire branch only reaches here) ──
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbData = await insertOrUpdateAfterAnalysis(supabase, user?.id || null, {
      method: validMethod,
      imageUrl: imageUrl || null,
      skinType: finalSkinType,
      finalScoresForDB,
      aiSummary,
    });

    if (user?.id) {
      await supabase.from("user_skin_profiles").upsert(
        {
          user_id: user.id,
          skin_type: finalSkinType,
          concerns: finalConcerns,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }

    return NextResponse.json(
      {
        sessionId: dbData.id,
        userSkinType: finalSkinType,
        mainConcerns: finalConcerns,
        summary: aiSummary,
        _debugSource: "questionnaire",
        needsSkinTypeConfirmation: false,
        confirmationQuestion: null,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("API Route Error:", error);

    if (error.message === "AI_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "API_QUOTA_EXCEEDED", message: "Traffic high. Try again." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// DISABLED: Groq text-only fallback (kept for reference, not called).
// Removed from the automatic chain because it only ever sees the v3
// heuristic's numbers (not the photo), and we've now confirmed those
// numbers can be unreliable (e.g. oiliness scored lower on a confirmed
// oily photo than a confirmed dry one). An LLM reasoning over noisy
// inputs produces a confident-looking but ungrounded result. Re-enable
// manually only if v3's metrics get independently validated later.
// ─────────────────────────────────────────────────────────────────────
// async function runGroqFallback(mediaPipeData: any, groqKey: string) {
//   const groq = new Groq({ apiKey: groqKey });
//   const systemPrompt = `You are an expert clinical dermatologist. Analyze this MediaPipe data: ${JSON.stringify(mediaPipeData || {})}. ...`;
//   const completion = await groq.chat.completions.create({
//     messages: [{ role: "system", content: systemPrompt }],
//     model: "llama-3.3-70b-versatile",
//     temperature: 0.1,
//     response_format: { type: "json_object" },
//   });
//   return completion;
// }