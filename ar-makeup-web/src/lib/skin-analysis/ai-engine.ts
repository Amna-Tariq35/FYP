import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import { Product, ConcernScores, SkincareRoutine } from "./recommend";
import { getTopCandidates } from "./candidate-selector";

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

export async function generateFinalRoutine(
  allDbProducts: Product[],
  userSkinType: string,
  // [UPDATED] Must accept Array as well for Photo Route compatibility
  concernScores: ConcernScores | string[] 
): Promise<SkincareRoutine & { summary: string }> { 
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

  const systemPrompt = `You are a Board-Certified Clinical Dermatologist specializing in evidence-based skincare formulations. Your goal is to select a perfectly synchronized AM & PM routine strictly from the provided candidates list based on the user's exact skin profile.

CRITICAL DERMATOLOGICAL DIRECTIVES:
1. STRICT DATA TRUTH (NO HALLUCINATIONS):
   - Base all reasoning STRICTLY on the provided 'skinType' and 'concerns'.
   - NEVER invent or mention unlisted skin conditions (e.g., do NOT mention acne, redness, dark spots, or sensitivity unless they are explicitly present in the user's concerns list).
   - If the profile shows "Normal" skin or basic "hydration" concerns, focus purely on skin barrier maintenance, hydration retention, and healthy radiance without diagnosing non-existent flaws.

2. CATEGORY EXCLUSIVITY & SEQUENCING:
   - Select EXACTLY 1 product per required category in strict order:
     * AM Routine: Cleanser -> Treatment -> Eye cream -> Moisturizer -> sunscreen
     * PM Routine: Cleanser -> Treatment -> Eye cream -> Moisturizer
   - MUST ONLY select valid product 'id' strings present in the provided candidates data. Do NOT invent or alter IDs.

3. FORMULA SAFETY & ACTIVE SYNERGY:
   - Ensure AM items have 'am_safe: true' and PM items have 'pm_safe: true'.
   - Check ingredient lists to prevent active ingredient clashes (e.g., avoiding conflicting exfoliants or harsh retinoid combinations).

4. MATCH SCORES & REASONING:
   - 'matchScore': Assign a UNIQUE integer between 85 and 99 for EACH product. NEVER duplicate a score across any AM or PM item.
   - 'matchReason': Write 1-2 concise, scientifically grounded sentences per product explaining why its key ingredients specifically target the user's profile.

5. AI SUMMARY:
   - 'aiSummary': Write a 2-3 sentence empathetic, professional dermatological assessment summarizing their skin profile state and explaining how this tailored routine preserves barrier health while targeting their main goals.`;
   const userPayload = {
    userProfile: { skinType: userSkinType, concerns: concernScores },
    amCandidates: lightweightAmCandidates,
    pmCandidates: lightweightPmCandidates,
  };

  let aiResult: any = null;

  // ------------------------------------------------------------------
  // [UPDATED] SAFE KEY USAGE (Removed delete process.env to prevent crashes)
  // ------------------------------------------------------------------
  try {
    console.log("Attempting generation with Gemini...");
    const skincareKey = process.env.GEMINI_API_KEY;

    if (!skincareKey) {
      throw new Error("GEMINI_API_KEY is not defined in .env file");
    }

    // Passing apiKey directly into the SDK isolates it safely
    const ai = new GoogleGenAI({ apiKey: skincareKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload) }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: routineResponseSchema,
        temperature: 0.2,
      },
    });

    aiResult = JSON.parse(response.text || "{}");
    // 👇 YEH LINE ADD KAREIN 👇
    console.log("AI RAW OUTPUT (GEMINI):", JSON.stringify(aiResult, null, 2)); 
    
    console.log("Successfully generated routine with Gemini!");

  } catch (geminiError) {
    console.warn("Gemini server busy/failed. Falling back to Groq...", geminiError);

    try {
      console.log("Attempting generation with Groq...");
      const groqKey = process.env.GROQ_SKINCARE_API_KEY ;
      const groq = new Groq({ apiKey: groqKey });

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Return JSON matching format: {"aiSummary":"...","amRoutine":[{"id":"","matchReason":"","matchScore":92}],"pmRoutine":[{"id":"","matchReason":"","matchScore":88}]}. Data: ${JSON.stringify(userPayload)}`,
          },
        ],
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      aiResult = JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
      // 👇 YEH LINE ADD KAREIN 👇
      console.log("AI RAW OUTPUT (GROQ):", JSON.stringify(aiResult, null, 2)); 
      
  
      console.log("Successfully generated routine with Groq Fallback!");
    } catch (groqError) {
      console.error("Both Gemini and Groq failed:", groqError);
      throw new Error("AI_SERVERS_BUSY");
    }
  }

  const assemble = (items: { id: string; matchReason: string; matchScore?: number }[]) => {
    return items
      .map((item) => {
        const candidateProduct = productMap.get(item.id);
        if (!candidateProduct) return null;
        return {
          ...candidateProduct,
          matchScore: item.matchScore || candidateProduct.matchScore || 90,
          matchReason: item.matchReason,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  };

  return {
    amRoutine: assemble(aiResult?.amRoutine || []),
    pmRoutine: assemble(aiResult?.pmRoutine || []),
    summary: aiResult?.aiSummary || "Based on your skin profile, this routine has been tailored to target your primary concerns.",
  };
}