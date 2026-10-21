import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import { Product, ConcernScores, SkincareRoutine } from "./recommend";
import { getTopCandidates } from "./candidate-selector";
import { buildDeterministicRoutine, type SafetyContext } from "./deterministic-routine";

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
  concernScores: ConcernScores | string[],
  safety: SafetyContext = {},
): Promise<SkincareRoutine & { summary: string; source: "ai" | "rules" | "mixed" }> { 
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

  const systemPrompt = `You are a skincare formulation assistant. Select an AM and PM routine strictly from the provided candidates based on the user's skin profile.

CRITICAL DIRECTIVES:
1. STRICT DATA TRUTH:
   - Base all reasoning ONLY on the provided skinType and concerns.
   - NEVER mention a concern that is not in the user's list.
   - This is product guidance, not a medical diagnosis.

2. CATEGORY EXCLUSIVITY:
   - Select EXACTLY 1 product per category:
     * AM: Cleanser -> Treatment -> Eye cream -> Moisturizer -> sunscreen
     * PM: Cleanser -> Treatment -> Eye cream -> Moisturizer
   - Use only product id strings from the candidates. Do not invent ids.

3. SAFETY:
   - AM items must be am_safe. PM items must be pm_safe.
   - Do not pair a retinoid with an AHA or BHA in the same routine.

4. REASONING:
   - matchReason: 1-2 sentences on why the product fits this profile.
   - matchScore: copy the candidate's existing score if present, otherwise use 80.

5. SUMMARY:
   - aiSummary: 2-3 plain sentences describing the profile and how the routine helps. Do not claim a clinical diagnosis.`;
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
      aiResult = null;
    }
  }

  const rules = buildDeterministicRoutine(allDbProducts, userSkinType, concernScores, {
    ...safety,
    skinType: userSkinType,
  });

  const assemble = (
    items: { id: string; matchReason: string; matchScore?: number }[] | undefined,
    fallback: typeof rules.amRoutine,
  ) => {
    const used = new Set<string>();
    const chosen = (items || [])
      .map((item) => {
        const candidateProduct = productMap.get(item.id);
        if (!candidateProduct || used.has(candidateProduct.category)) return null;
        used.add(candidateProduct.category);
        return {
          ...candidateProduct,
          matchScore: candidateProduct.matchScore || item.matchScore || 80,
          matchReason: item.matchReason || candidateProduct.matchReason,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    for (const item of fallback) {
      if (!used.has(item.category)) {
        chosen.push(item);
        used.add(item.category);
      }
    }
    return chosen;
  };

  if (!aiResult) {
    return rules;
  }

  const amRoutine = assemble(aiResult.amRoutine, rules.amRoutine);
  const pmRoutine = assemble(aiResult.pmRoutine, rules.pmRoutine);
  const aiFilledBoth = (aiResult.amRoutine || []).length > 0 && (aiResult.pmRoutine || []).length > 0;
  const source = aiFilledBoth && amRoutine.length >= rules.amRoutine.length ? "ai" : "mixed";

  return {
    amRoutine,
    pmRoutine,
    summary:
      aiResult.aiSummary ||
      rules.summary,
    source,
  };
}