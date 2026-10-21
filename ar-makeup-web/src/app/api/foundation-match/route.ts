// src/app/api/foundation-match/route.ts
/**
 * Foundation Shade Match API
 *
 * - `POST /api/foundation-match` — measure skin colour, rank the foundation
 *   catalog against it, optionally persist the reading.
 * - `GET  /api/foundation-match` — the caller's last saved reading, so a client
 *   can show a previous result without making the user re-shoot a photo.
 *
 * ## Why the request body is not a photo
 *
 * The original design had the device POST `{ imageBase64 }`. It is not built that
 * way, for three reasons that all point the same direction:
 *
 *  1. A phone camera frame base64-encodes to roughly 3–7 MB. That is over the
 *     body limit of every serverless platform this would deploy to, so the
 *     feature would fail in production while working locally — the worst class
 *     of bug to ship in a final-year project.
 *  2. Decoding JPEG server-side needs an image dependency this project does not
 *     have, and adding one to decode a face is a lot of surface area for no gain.
 *  3. The *device* is where the face landmarks are. ML Kit's face contours locate
 *     a cheek to within a few pixels; a server holding only a bounding box would
 *     be guessing. Sampling belongs where the landmarks already are.
 *
 * So the device samples, and about forty numbers cross the network instead of a
 * photograph. No user's face is ever uploaded or stored. The colour science —
 * white balance, CIELAB, ΔE2000, the ranking — still lives here and is shared, so
 * the website can call the same endpoint later with `{ skinHex }` from a canvas
 * sample and get an identical answer.
 *
 * ## Authentication
 *
 * Via {@link resolveRequestAuth}, which accepts both the website's SSR cookies
 * and the Flutter app's `Authorization: Bearer` token. Using
 * `createSupabaseServerClient()` directly here would 401 every request from the
 * app — which is exactly what `/api/beauty-profile` did until it was migrated to
 * the same helper.
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestAuth } from "@/src/lib/supabase/request-auth";
import {
  analyseSkin,
  analyseSkinHex,
  parseIlluminant,
  parsePatches,
  parseWhiteReference,
  type AnalysisDebug,
  type AnalysisResult,
  type CalibrationLabel,
} from "@/src/lib/foundation/analyze";
import {
  rankFoundationShades,
  type ProductRow,
  type ShadeRow,
  type RankResult,
} from "@/src/lib/foundation/match";
import { hexToRgb, labToRgb, rgbToHex, type Lab } from "@/src/lib/foundation/color";
import { mapSkinToSwatch, SWATCH_MAP_VERSION } from "@/src/lib/foundation/swatch-map";
import { clientKey, rateLimit } from "@/src/lib/skin-analysis/rate-limit";

/** Catalog convention: every foundation product key starts with this. */
const FOUNDATION_PREFIX = "fnd_";

/**
 * Largest body accepted, in bytes.
 *
 * A well-formed request is about 700 bytes. 16 KB leaves an order of magnitude of
 * headroom for a client that pads fields, and still refuses a request that is
 * trying to send an image — checked before parsing so an oversized body is never
 * buffered or deserialised.
 */
const MAX_BODY_BYTES = 16 * 1024;

/** Most shades any client has a use for. Guards the response size. */
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

const FINISHES = ["matte", "dewy", "satin", "natural"];

// ─────────────────────────────────────────────────────────────────────────────
// Response shape
// ─────────────────────────────────────────────────────────────────────────────

type MatchResponse = {
  quality: AnalysisResult["quality"];
  confidence: AnalysisResult["confidence"];
  skin: AnalysisResult["skin"];
  matches: RankResult["matches"];
  lighterAlternate: RankResult["lighterAlternate"];
  deeperAlternate: RankResult["deeperAlternate"];
  diagnostics: RankResult["diagnostics"];
  /** Mapped catalog colour. Ranking uses this. The skin swatch stays on `skin.hex`. */
  referenceHex: string | null;
  /** Region spread of the reading, in ΔE2000. Not a clinical accuracy claim. */
  expectedError: number | null;
  calibration: CalibrationLabel;
  /** Up to three nearby shades. Shown when confidence is low. */
  shadeRange: RankResult["shadeRange"];
  /** Present only when the request set `debug: true`. No pixels. */
  debug?: AnalysisDebug | null;
  /** True when the reading was written to `user_skin_profiles`. */
  savedToProfile: boolean;
  /** Non-fatal persistence problems, surfaced instead of swallowed. */
  persistenceNotes: string[];
};

type LastMatchResponse = {
  skin_tone_hex: string | null;
  undertone: string | null;
  depth_level: string | null;
  monk_scale: number | null;
  source: string | null;
  updated_at: string | null;
  /** Null when the log table has no row for this user (or does not exist yet). */
  lastRun: {
    matched_product_key: string | null;
    matched_shade_key: string | null;
    matched_shade_name: string | null;
    matched_shade_hex: string | null;
    delta_e: number | null;
    confidence: number | null;
    created_at: string | null;
  } | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Per-user data must never be cached by a CDN or a browser. Set explicitly
 * rather than relying on Next's inference, because a future `export const
 * dynamic` change elsewhere should not be able to make this cacheable.
 */
const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// ─────────────────────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const paced = rateLimit(`foundation:${clientKey(request)}`, 8, 60_000);
    if (!paced.ok) return jsonError("Too many requests. Please wait a minute.", 429);

    const auth = await resolveRequestAuth(request);
    if (!auth) return jsonError("Unauthorized", 401);
    const { supabase, user } = auth;

    // ── Body: size, then shape ───────────────────────────────────────────────
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return jsonError(
        "Request body too large. Send sampled patch colours, not an image.",
        413
      );
    }

    let body: Record<string, unknown>;
    try {
      const raw = await request.text();
      // content-length is a claim, not a fact — a chunked request may omit it.
      if (raw.length > MAX_BODY_BYTES) {
        return jsonError(
          "Request body too large. Send sampled patch colours, not an image.",
          413
        );
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return jsonError("Body must be a JSON object.");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return jsonError("Invalid JSON body");
    }

    // Reject the old contract loudly. A client still sending a photo would
    // otherwise get "patches is required", which points at the wrong problem.
    if ("imageBase64" in body || "image" in body) {
      return jsonError(
        "This endpoint does not accept images. Sample skin patches on the device " +
          "and send { patches, illuminant } — see the module docs for why.",
        400
      );
    }

    const limit = parseLimit(body.limit);
    if (limit === null) {
      return jsonError(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
    }

    const finishPreference = body.finishPreference ?? body.finish_preference ?? null;
    if (finishPreference !== null) {
      if (
        typeof finishPreference !== "string" ||
        !FINISHES.includes(finishPreference.toLowerCase())
      ) {
        return jsonError(`finishPreference must be one of ${FINISHES.join(", ")}.`);
      }
    }

    const save = body.save === undefined ? true : body.save === true;

    if (body.action === "feedback") {
      return handleFeedback(supabase, user.id, body);
    }

    const wantDebug = body.debug === true;

    // ── Measure ──────────────────────────────────────────────────────────────
    let analysis: AnalysisResult;

    if (body.patches !== undefined) {
      const patches = parsePatches(body.patches);
      if ("error" in patches) return jsonError(patches.error);

      const illuminant = parseIlluminant(body.illuminant);
      if ("error" in illuminant) return jsonError(illuminant.error);

      const whiteReference = parseWhiteReference(body.whiteReference);
      if ("error" in whiteReference) return jsonError(whiteReference.error);

      analysis = analyseSkin(patches.patches, illuminant.illuminant, undefined, {
        whiteReference: whiteReference.whiteReference,
        debug: wantDebug,
      });
    } else if (typeof body.skinHex === "string") {
      const rgb = hexToRgb(body.skinHex);
      if (!rgb) return jsonError("skinHex must be a hex colour like #E8C3A8.");
      analysis = analyseSkinHex(rgb);
    } else {
      return jsonError(
        "Send either patches (from on-device sampling) or skinHex (a measured colour)."
      );
    }

    // A failed quality gate is a legitimate outcome, not a client error: the app
    // has to render "retake your photo, here's why". 4xx would make every client
    // treat it as a bug in its own request.
    if (!analysis.quality.ok || !analysis.skin) {
      return NextResponse.json<MatchResponse>(
        {
          quality: analysis.quality,
          confidence: analysis.confidence,
          skin: analysis.skin,
          matches: [],
          lighterAlternate: null,
          deeperAlternate: null,
          diagnostics: emptyDiagnostics(),
          referenceHex: null,
          expectedError: analysis.expectedError,
          calibration: analysis.calibration,
          shadeRange: [],
          ...(wantDebug ? { debug: analysis.debug } : {}),
          savedToProfile: false,
          persistenceNotes: [],
        },
        { headers: NO_STORE }
      );
    }

    const mapped = mapSkinToSwatch(analysis.skin.lab);
    const referenceHex = rgbToHex(labToRgb(mapped));
    const debug = wantDebug
      ? {
          ...(analysis.debug ?? emptyDebug(analysis.skin.lab)),
          mappedLab: roundLab(mapped),
          mapVersion: SWATCH_MAP_VERSION,
        }
      : undefined;

    // ── Rank the catalog ─────────────────────────────────────────────────────
    const catalog = await loadFoundationCatalog(supabase);
    if (!catalog.ok) {
      console.error("[foundation-match] catalog read failed", catalog.message);
      return jsonError("Could not read the shade catalog", 500);
    }
    const { shades, products } = catalog;

    if (shades.length === 0) {
      // Not a 500: the maths worked, there is simply nothing to recommend. The
      // measured skin colour is still returned so the client can show the swatch
      // and save the profile.
      return NextResponse.json<MatchResponse>(
        {
          quality: analysis.quality,
          confidence: analysis.confidence,
          skin: analysis.skin,
          matches: [],
          lighterAlternate: null,
          deeperAlternate: null,
          diagnostics: emptyDiagnostics([
            "No foundation shades in the catalog to match against.",
          ]),
          referenceHex,
          expectedError: analysis.expectedError,
          calibration: analysis.calibration,
          shadeRange: [],
          ...(debug ? { debug } : {}),
          savedToProfile: false,
          persistenceNotes: [],
        },
        { headers: NO_STORE }
      );
    }

    const ranked = rankFoundationShades(shades, products, {
      skinLab: mapped,
      undertone: analysis.skin.undertone,
      finishPreference:
        typeof finishPreference === "string" ? finishPreference.toLowerCase() : null,
      limit,
      confidenceLabel: analysis.confidence.label,
    });

    // ── Persist ──────────────────────────────────────────────────────────────
    // Both writes are non-fatal by design. A user who has just had their skin
    // measured should see the result even if the log table has not been created
    // yet or a policy blocks the write; what must not happen is a silent
    // discrepancy, so anything that failed is named in `persistenceNotes`.
    const persistenceNotes: string[] = [];
    let savedToProfile = false;

    if (save) {
      savedToProfile = await saveProfile(
        supabase,
        user.id,
        analysis,
        persistenceNotes
      );
      await logRun(supabase, user.id, analysis, ranked, persistenceNotes);
    }

    return NextResponse.json<MatchResponse>(
      {
        quality: analysis.quality,
        confidence: analysis.confidence,
        skin: analysis.skin,
        matches: ranked.matches,
        lighterAlternate: ranked.lighterAlternate,
        deeperAlternate: ranked.deeperAlternate,
        diagnostics: ranked.diagnostics,
        referenceHex,
        expectedError: analysis.expectedError,
        calibration: analysis.calibration,
        shadeRange: ranked.shadeRange,
        ...(debug ? { debug } : {}),
        savedToProfile,
        persistenceNotes,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("[foundation-match POST]", err);
    return jsonError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveRequestAuth(request);
    if (!auth) return jsonError("Unauthorized", 401);
    const { supabase, user } = auth;

    const { data: profile } = await supabase
      .from("user_skin_profiles")
      .select("skin_tone_hex, undertone, depth_level, monk_scale, source, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // The log table is created by db/004_foundation_match.sql. Until that runs,
    // this select errors — which must degrade to "no previous run", not a 500.
    let lastRun: LastMatchResponse["lastRun"] = null;
    const { data: log, error: logError } = await supabase
      .from("foundation_match_logs")
      .select(
        "matched_product_key, matched_shade_key, matched_shade_name, matched_shade_hex, delta_e, confidence, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!logError && log) lastRun = log as LastMatchResponse["lastRun"];

    return NextResponse.json<LastMatchResponse>(
      {
        skin_tone_hex: profile?.skin_tone_hex ?? null,
        undertone: profile?.undertone ?? null,
        depth_level: profile?.depth_level ?? null,
        monk_scale: profile?.monk_scale ?? null,
        source: profile?.source ?? null,
        updated_at: profile?.updated_at ?? null,
        lastRun,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("[foundation-match GET]", err);
    return jsonError("Internal server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseLimit(input: unknown): number | null {
  if (input === undefined || input === null) return DEFAULT_LIMIT;
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  if (input < 1 || input > MAX_LIMIT) return null;
  return input;
}

function emptyDiagnostics(notes: string[] = []): RankResult["diagnostics"] {
  return {
    shadeRowsConsidered: 0,
    distinctColours: 0,
    lightnessRange: { min: 0, max: 0, span: 0 },
    hueSpanDegrees: 0,
    localHueSpanDegrees: 0,
    localColourCount: 0,
    undertoneWeight: 0,
    notes,
  };
}

type CatalogClient = { from: (table: string) => any };

async function loadFoundationCatalog(
  supabase: CatalogClient
): Promise<
  | { ok: true; shades: ShadeRow[]; products: ProductRow[] }
  | { ok: false; message: string }
> {
  const productsRes = await supabase
    .from("makeup_products")
    .select("product_key, name, brand, price, image_url, finish, coverage, is_active")
    .like("product_key", `${FOUNDATION_PREFIX}%`);
  if (productsRes.error) {
    return { ok: false, message: String(productsRes.error.message ?? productsRes.error) };
  }

  const withMatch = await supabase
    .from("product_shades")
    .select(
      "product_key, shade_key, shade_name, shade_hex, shade_order, undertone, match_hex"
    )
    .like("product_key", `${FOUNDATION_PREFIX}%`);

  if (!withMatch.error) {
    return {
      ok: true,
      shades: (withMatch.data ?? []) as ShadeRow[],
      products: (productsRes.data ?? []) as ProductRow[],
    };
  }

  // match_hex is added by db/013. Until that file is applied the select errors
  // and ranking continues on shade_hex, which is what older databases have.
  const plain = await supabase
    .from("product_shades")
    .select("product_key, shade_key, shade_name, shade_hex, shade_order, undertone")
    .like("product_key", `${FOUNDATION_PREFIX}%`);
  if (plain.error) {
    return { ok: false, message: String(plain.error.message ?? plain.error) };
  }
  return {
    ok: true,
    shades: (plain.data ?? []) as ShadeRow[],
    products: (productsRes.data ?? []) as ProductRow[],
  };
}

function roundLab(lab: Lab): Lab {
  return {
    L: Number(lab.L.toFixed(2)),
    a: Number(lab.a.toFixed(2)),
    b: Number(lab.b.toFixed(2)),
  };
}

function emptyDebug(raw: Lab): AnalysisDebug {
  return {
    regions: [],
    illuminant: null,
    gains: { r: 1, g: 1, b: 1 },
    whiteBalanceStrength: 1,
    regionsUsed: [],
    rawLab: roundLab(raw),
  };
}

async function handleFeedback(
  supabase: CatalogClient,
  userId: string,
  body: Record<string, unknown>
) {
  const vote = body.vote;
  if (vote !== "too_light" && vote !== "right" && vote !== "too_dark") {
    return jsonError("vote must be too_light, right, or too_dark.");
  }

  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const logId =
    typeof body.logId === "string" && uuid.test(body.logId) ? body.logId : null;

  try {
    const { error } = await supabase.from("foundation_match_feedback").insert({
      user_id: userId,
      log_id: logId,
      vote,
    });
    if (error) {
      const message = String(error.message ?? error);
      const missing = /relation|does not exist|schema cache|could not find/i.test(message);
      return NextResponse.json(
        {
          saved: false,
          note: missing
            ? "Feedback isn't stored on this server yet. The vote was not lost on screen, but it could not be saved."
            : "That vote couldn't be saved. Please try again in a moment.",
        },
        { headers: NO_STORE }
      );
    }
  } catch (err) {
    console.error("[foundation-match] feedback insert threw", err);
    return NextResponse.json(
      {
        saved: false,
        note: "That vote couldn't be saved. Please try again in a moment.",
      },
      { headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      saved: true,
      note: "Thanks — that vote is saved for a later review. It does not change today's match.",
    },
    { headers: NO_STORE }
  );
}

/**
 * Writes the measured tone into the beauty profile.
 *
 * Only the four measured columns are touched. `coverage_preference`,
 * `finish_preference`, `allergies`, `skin_type` and `concerns` are the user's own
 * answers and an upsert that included them as null would wipe them.
 *
 * `source` is merged rather than overwritten: a user who filled the profile in by
 * hand and then ran an analysis is `'both'`, which is what the column's check
 * constraint allows and what the profile screen needs in order to say where each
 * value came from.
 */
async function saveProfile(
  supabase: { from: (t: string) => any },
  userId: string,
  analysis: AnalysisResult,
  notes: string[]
): Promise<boolean> {
  const skin = analysis.skin;
  if (!skin) return false;

  try {
    const { data: existing } = await supabase
      .from("user_skin_profiles")
      .select("source")
      .eq("user_id", userId)
      .maybeSingle();

    const prior = existing?.source ?? null;
    const source =
      prior === "manual" || prior === "both" ? "both" : "analysis";

    const { error } = await supabase.from("user_skin_profiles").upsert(
      {
        user_id: userId,
        skin_tone_hex: skin.hex,
        undertone: skin.undertone,
        depth_level: skin.depthLevel,
        monk_scale: skin.monkScale,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[foundation-match] profile upsert failed", error);
      notes.push(explainProfileSaveFailure(error));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[foundation-match] profile upsert threw", err);
    notes.push(explainProfileSaveFailure(err));
    return false;
  }
}

function explainProfileSaveFailure(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? error)
      : String(error ?? "");
  if (/relation|does not exist|schema cache|could not find|42P01|PGRST205/i.test(message)) {
    return "Not saved to your profile because that table is not on the server yet. The reading above still stands.";
  }
  if (/jwt|not authenticated|permission denied|42501|row-level|RLS/i.test(message)) {
    return "Not saved to your profile because you are not signed in. The reading above still stands.";
  }
  return "Not saved to your profile because the server rejected the write. The reading above still stands.";
}

/**
 * Appends a row to the run log.
 *
 * The log is what makes the feature auditable: it records what was measured, how
 * confident the measurement was, and which shade won, so a result the user
 * disputes can be reconstructed afterwards. It stores derived colour values only
 * — never the patches, never anything that could reconstruct a face.
 */
async function logRun(
  supabase: { from: (t: string) => any },
  userId: string,
  analysis: AnalysisResult,
  ranked: RankResult,
  notes: string[]
): Promise<void> {
  const skin = analysis.skin;
  if (!skin) return;
  const top = ranked.matches[0] ?? null;

  try {
    const { error } = await supabase.from("foundation_match_logs").insert({
      user_id: userId,
      skin_tone_hex: skin.hex,
      skin_lab_l: round(skin.lab.L, 2),
      skin_lab_a: round(skin.lab.a, 2),
      skin_lab_b: round(skin.lab.b, 2),
      ita_degrees: round(skin.ita, 2),
      depth_level: skin.depthLevel,
      undertone: skin.undertone,
      monk_scale: skin.monkScale,
      confidence: round(analysis.confidence.score, 3),
      confidence_label: analysis.confidence.label,
      regions_used: skin.regionsUsed,
      warnings: analysis.quality.warnings,
      matched_product_key: top?.productKey ?? null,
      matched_shade_key: top?.shadeKey ?? null,
      matched_shade_name: top?.shadeName ?? null,
      matched_shade_hex: top?.shadeHex ?? null,
      delta_e: top ? round(top.deltaE, 3) : null,
      shades_considered: ranked.diagnostics.shadeRowsConsidered,
    });

    if (error) {
      // Almost always "relation does not exist" before the migration is applied.
      console.error("[foundation-match] log insert failed", error);
      notes.push("This run was not recorded in your match history.");
    }
  } catch (err) {
    console.error("[foundation-match] log insert threw", err);
    notes.push("This run was not recorded in your match history.");
  }
}

function round(value: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}
