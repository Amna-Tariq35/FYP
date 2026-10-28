import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { generateFinalRoutine } from "@/src/lib/skin-analysis/ai-engine";
import {
  concernScoreMap,
  normalizeConcernScores,
} from "@/src/lib/skin-analysis/contract";
import { buildDeterministicRoutine } from "@/src/lib/skin-analysis/deterministic-routine";
import { clientKey, rateLimit } from "@/src/lib/skin-analysis/rate-limit";
import { normalizeCatalogProduct } from "@/src/lib/skin-analysis/product-shape";
import type { Product } from "@/src/lib/skin-analysis/recommend";

export const runtime = "nodejs";
export const maxDuration = 60;

function ownsLog(logUserId: string | null, requesterId: string | null) {
  if (!logUserId) return true;
  return Boolean(requesterId) && logUserId === requesterId;
}

async function loadProducts(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const rows: Product[] = [];
  for (let page = 0; page < 20; page++) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("makeup_products")
      .select("id,product_key,name,brand,category,price,image_url,skin_type,tags,ingredients,am_safe,pm_safe,is_active")
      .eq("is_active", true)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const product = normalizeCatalogProduct(row as Record<string, unknown>);
      if (product) rows.push(product);
    }
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const limit = rateLimit(`routine:${clientKey(req)}`, 8, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const analysisId = typeof body?.analysisId === "string" ? body.analysisId : "";
    if (!analysisId) {
      return NextResponse.json({ error: "Missing analysis id." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const logs = createSupabaseAdminClient();
    const { data: log, error: logError } = await logs
      .from("skin_analysis_logs")
      .select("id, user_id, skin_type, concern_scores, routine_snapshot")
      .eq("id", analysisId)
      .maybeSingle();

    if (logError || !log || !ownsLog(log.user_id, user?.id ?? null)) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }

    const snapshot = log.routine_snapshot as {
      amRoutine?: unknown[];
      pmRoutine?: unknown[];
      source?: string;
    } | null;
    if (snapshot?.source && snapshot.amRoutine && snapshot.amRoutine.length > 0) {
      return NextResponse.json({
        success: true,
        data: {
          amRoutine: snapshot.amRoutine,
          pmRoutine: snapshot.pmRoutine ?? [],
          summary: null,
          source: "cached",
        },
      });
    }

    const normalized = normalizeConcernScores(log.concern_scores, null);
    let allergies = normalized.allergies ?? [];
    let pregnant = normalized.pregnant === true;
    if (user?.id) {
      const { data: profile } = await supabase
        .from("user_skin_profiles")
        .select("allergies")
        .eq("user_id", user.id)
        .maybeSingle();
      if (Array.isArray(profile?.allergies) && profile.allergies.length > 0) {
        allergies = profile.allergies as string[];
      }
    }

    const products = await loadProducts(supabase);
    if (products.length === 0) {
      return NextResponse.json({ error: "No skincare products are available right now." }, { status: 404 });
    }

    const skinType = log.skin_type || "Normal";
    const concernInput = concernScoreMap(normalized);

    let routine;
    try {
      routine = await generateFinalRoutine(products, skinType, concernInput, {
        allergies,
        pregnant,
        skinType,
      });
    } catch (error) {
      console.error("routine engines failed, using scores only", error);
      routine = buildDeterministicRoutine(products, skinType, concernInput, {
        allergies,
        pregnant,
        skinType,
      });
    }

    if (routine.amRoutine.length === 0 && routine.pmRoutine.length === 0) {
      routine = buildDeterministicRoutine(products, skinType, concernInput, {
        allergies,
        pregnant,
        skinType,
      });
    }

    const { error: updateError } = await logs
      .from("skin_analysis_logs")
      .update({
        ai_summary: routine.summary,
        routine_snapshot: {
          amRoutine: routine.amRoutine,
          pmRoutine: routine.pmRoutine,
          source: routine.source,
        },
      })
      .eq("id", analysisId);

    if (updateError) {
      console.error("routine save failed");
    }

    return NextResponse.json({ success: true, data: routine });
  } catch (error) {
    console.error("generate-routine error", error);
    return NextResponse.json({ error: "Failed to generate routine." }, { status: 500 });
  }
}
