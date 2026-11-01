import type { RecommendedProduct } from "./recommend";

/**
 * Process-local cache. skin_analysis_logs stores one routine per analysis
 * session, and there is no shared routine table that can be written without
 * a new migration. Entries live only in this server process.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

export type CachedRoutine = {
  amRoutine: RecommendedProduct[];
  pmRoutine: RecommendedProduct[];
  summary: string;
  source: "ai" | "mixed";
};

type CacheParts = {
  skinType: string;
  concerns: Record<string, number>;
  sensitivity: string;
  finish: string;
  allergies: string[];
  pregnant: boolean;
};

const entries = new Map<string, { at: number; routine: CachedRoutine }>();

export function routineFingerprint(parts: CacheParts) {
  const concerns = Object.entries(parts.concerns)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([tag, value]) => `${tag}:${Math.round(value * 100) / 100}`)
    .sort()
    .join(",");
  const allergies = parts.allergies
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
  return [
    parts.skinType.trim().toLowerCase(),
    concerns,
    parts.sensitivity.trim().toLowerCase(),
    parts.finish.trim().toLowerCase(),
    allergies,
    parts.pregnant ? "pregnant" : "not-pregnant",
  ].join("|");
}

export function readRoutineCache(key: string): CachedRoutine | null {
  const hit = entries.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    entries.delete(key);
    return null;
  }
  return hit.routine;
}

export function writeRoutineCache(key: string, routine: CachedRoutine) {
  if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }
  entries.set(key, { at: Date.now(), routine });
}
