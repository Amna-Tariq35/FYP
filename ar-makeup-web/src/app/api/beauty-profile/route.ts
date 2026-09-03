// src/app/api/beauty-profile/route.ts
/**
 * Beauty Profile API
 * 
 * Endpoints:
 * - GET /api/beauty-profile — Fetch user's current beauty profile
 * - GET /api/beauty-profile?prefill=true — Fetch pre-fill data (from web analysis)
 * - POST /api/beauty-profile — Save/update beauty profile
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestAuth } from "@/src/lib/supabase/request-auth";

// ─────────────────────────────────────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface BeautyProfileResponse {
  undertone: string | null;
  depth_level: string | null;
  skin_tone_hex: string | null;
  monk_scale: number | null;
  coverage_preference: string | null;
  finish_preference: string | null;
  allergies: string[] | null;
  source: string | null;
  updated_at: string | null;
}

interface PreFillResponse {
  skin_type: string | null;
  concerns: string[] | null;
  undertone: string | null;
  depth_level: string | null;
  source: string | null;
  last_analysis_date: string | null;
}

interface SaveProfilePayload {
  skin_type?: string;
  undertone?: string;
  depth_level?: string;
  skin_tone_hex?: string;
  monk_scale?: number | null;
  coverage_preference?: string;
  finish_preference?: string;
  concerns?: string[];
  allergies?: string[];
  source?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beauty-profile
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Both clients call this: the website with SSR cookies, the Flutter app with
    // an Authorization: Bearer token out of shared_preferences. Reading cookies
    // only — which this route did — returns 401 to the app for every request, and
    // the Dart service swallows it, so the symptom is a blank profile screen.
    const auth = await resolveRequestAuth(request);
    if (!auth) {
      return jsonError("Unauthorized", 401);
    }
    const { supabase, user } = auth;

    const prefill = request.nextUrl.searchParams.get("prefill") === "true";

    if (prefill) {
      // Return pre-fill data from web analysis
      const { data, error } = await supabase
        .from("user_skin_profiles")
        .select("skin_type, concerns, undertone, depth_level, source, updated_at")
        .eq("user_id", user.id)
        .single();

      if (error) {
        // No profile exists yet; return empty prefill
        return NextResponse.json<PreFillResponse>({
          skin_type: null,
          concerns: null,
          undertone: null,
          depth_level: null,
          source: null,
          last_analysis_date: null,
        });
      }

      return NextResponse.json<PreFillResponse>({
        skin_type: data?.skin_type || null,
        concerns: data?.concerns || null,
        undertone: data?.undertone || null,
        depth_level: data?.depth_level || null,
        source: data?.source || null,
        last_analysis_date: data?.updated_at || null,
      });
    }

    // Return full beauty profile (excluding skin_type, concerns — those are in web analysis)
    const { data, error } = await supabase
      .from("user_skin_profiles")
      .select(
        "undertone, depth_level, skin_tone_hex, monk_scale, coverage_preference, finish_preference, allergies, source, updated_at"
      )
      .eq("user_id", user.id)
      .single();

    if (error) {
      // No profile exists yet; return empty defaults
      return NextResponse.json<BeautyProfileResponse>({
        undertone: null,
        depth_level: null,
        skin_tone_hex: null,
        monk_scale: null,
        coverage_preference: null,
        finish_preference: null,
        allergies: null,
        source: null,
        updated_at: null,
      });
    }

    return NextResponse.json<BeautyProfileResponse>({
      undertone: data?.undertone || null,
      depth_level: data?.depth_level || null,
      skin_tone_hex: data?.skin_tone_hex || null,
      monk_scale: data?.monk_scale || null,
      coverage_preference: data?.coverage_preference || null,
      finish_preference: data?.finish_preference || null,
      allergies: data?.allergies || null,
      source: data?.source || null,
      updated_at: data?.updated_at || null,
    });
  } catch (err) {
    console.error("[beauty-profile GET]", err);
    return jsonError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beauty-profile
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveRequestAuth(request);
    if (!auth) {
      return jsonError("Unauthorized", 401);
    }
    const { supabase, user } = auth;

    let payload: SaveProfilePayload;
    try {
      payload = (await request.json()) as SaveProfilePayload;
    } catch {
      return jsonError("Invalid JSON body");
    }

    // Validate enums if provided
    if (payload.undertone && !["cool", "warm", "neutral", "olive"].includes(payload.undertone)) {
      return jsonError("Invalid undertone value");
    }

    if (
      payload.depth_level &&
      !["fair", "light", "medium", "tan", "deep", "rich"].includes(payload.depth_level)
    ) {
      return jsonError("Invalid depth_level value");
    }

    if (
      payload.coverage_preference &&
      !["sheer", "medium", "full"].includes(payload.coverage_preference)
    ) {
      return jsonError("Invalid coverage_preference value");
    }

    if (
      payload.finish_preference &&
      !["matte", "dewy", "satin"].includes(payload.finish_preference)
    ) {
      return jsonError("Invalid finish_preference value");
    }

    if (payload.source && !["analysis", "manual", "both"].includes(payload.source)) {
      return jsonError("Invalid source value");
    }

    if (payload.monk_scale !== undefined && payload.monk_scale !== null) {
      const m = payload.monk_scale;
      if (!Number.isInteger(m) || m < 1 || m > 10) {
        return jsonError("monk_scale must be between 1 and 10");
      }
    }

    // Only columns the caller actually sent are written.
    //
    // This used to spread every column with `payload.x || null`, which meant a
    // request that set one field silently erased the rest: saving a finish
    // preference wiped the undertone, and any manual save wiped the values the
    // foundation matcher had just measured. An upsert whose SET list is built from
    // the present keys leaves everything else untouched, which is what a partial
    // profile save has to do.
    const update: Record<string, unknown> = { user_id: user.id };
    const copyIfPresent = (key: keyof SaveProfilePayload) => {
      if (payload[key] !== undefined) update[key] = payload[key];
    };
    (
      [
        "skin_type",
        "undertone",
        "depth_level",
        "skin_tone_hex",
        "monk_scale",
        "coverage_preference",
        "finish_preference",
        "concerns",
        "allergies",
      ] as const
    ).forEach(copyIfPresent);

    // `source` records where the values came from and is merged, not replaced: a
    // profile that was measured and then edited by hand is 'both'.
    const { data: existing } = await supabase
      .from("user_skin_profiles")
      .select("source")
      .eq("user_id", user.id)
      .maybeSingle();

    const incoming = payload.source || "manual";
    const prior = existing?.source ?? null;
    update.source =
      prior && prior !== incoming && prior !== "both" ? "both" : incoming;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("user_skin_profiles")
      .upsert(update, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("[beauty-profile POST upsert error]", error);
      return jsonError("Failed to save profile", 500);
    }

    return NextResponse.json(
      {
        message: "Profile updated successfully",
        profile: data,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[beauty-profile POST]", err);
    return jsonError("Internal server error", 500);
  }
}
