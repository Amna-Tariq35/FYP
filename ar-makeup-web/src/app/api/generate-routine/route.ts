import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabase/server"; // Apne path ke mutabiq adjust karein
import { generateFinalRoutine } from "@/src/lib/skin-analysis/ai-engine"; // Apne path ke mutabiq adjust karein

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Frontend se analysisId (jo aapke URL mein 'id' hai) aana zaroori hai
    const { userSkinType, concernScores, analysisId } = body;

    // Validation
    if (!userSkinType || !concernScores || !analysisId) {
      return NextResponse.json(
        { error: "Missing required fields: userSkinType, concernScores, or analysisId" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // 1. Fetch Active Products
    const { data: products, error: dbError } = await supabase
      .from("makeup_products")
      .select("*")
      .eq("is_active", true);

    if (dbError) throw new Error(`Database Error: ${dbError.message}`);
    
    if (!products || products.length === 0) {
      return NextResponse.json({ error: "No products found." }, { status: 404 });
    }

    console.log(`Generating routine for ID: ${analysisId}, Skin Type: ${userSkinType}`);
    
    // 2. Generate Routine using your Master Engine
    const finalRoutineResult = await generateFinalRoutine(
      products,
      userSkinType,
      concernScores
    );

    // 👉 3. PERFECT SCHEMA MATCH: Save to Database!
    // 'routine_snapshot' mein hum AM aur PM dono arrays ko JSON form mein save kar rahe hain.
    const { error: updateError } = await supabase
      .from("skin_analysis_logs")
      .update({
        ai_summary: finalRoutineResult.summary,
        routine_snapshot: {
          amRoutine: finalRoutineResult.amRoutine,
          pmRoutine: finalRoutineResult.pmRoutine
        }
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("Supabase Update Error:", updateError);
      throw new Error(`Failed to save routine: ${updateError.message}`);
    }

    console.log("Successfully saved routine to Database!");

    // 4. Return Success to Frontend
    return NextResponse.json(
      {
        success: true,
        data: finalRoutineResult,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate routine.", details: error?.message },
      { status: 500 }
    );
  }
}