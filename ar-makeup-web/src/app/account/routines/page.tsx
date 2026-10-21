import Link from "next/link";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

type LogRow = {
  id: string;
  skin_type: string | null;
  concern_scores: unknown;
  routine_snapshot: unknown;
  created_at: string | null;
};

function concernList(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as { main_concerns?: unknown }).main_concerns;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item)).filter(Boolean).slice(0, 6);
}

function routineNames(snapshot: unknown, keys: string[]): string[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const record = snapshot as Record<string, unknown>;
  const list = keys.map((key) => record[key]).find((value) => Array.isArray(value));
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { name?: string; product?: { name?: string } };
      return row.product?.name || row.name || "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

export default async function PastRoutinesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-[var(--bg-base)]">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Past routines</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Sign in to see your saved skin routines. This is not a diagnosis.
          </p>
          <Link href="/auth/sign-in?next=/account/routines" className="mt-6 inline-block text-sm font-semibold text-[#C06C84]">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("skin_analysis_logs")
    .select("id, skin_type, concern_scores, routine_snapshot, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const logs = (error ? [] : (data as LogRow[] | null) ?? []).filter((row) => row.id);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Past routines</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Earlier skin routines saved to your account. This is not a diagnosis.
        </p>
        {error ? (
          <p className="mt-6 text-sm text-red-600">Could not load routines.</p>
        ) : logs.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--text-muted)]">No routines yet.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {logs.map((log) => {
              const concerns = concernList(log.concern_scores);
              const am = routineNames(log.routine_snapshot, ["amRoutine", "am_routine", "AM"]);
              const pm = routineNames(log.routine_snapshot, ["pmRoutine", "pm_routine", "PM"]);
              const when = log.created_at
                ? new Date(log.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Date unavailable";
              return (
                <li key={log.id} className="rounded-2xl border border-[var(--border-soft)] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{when}</p>
                      <h2 className="mt-1 font-semibold text-[var(--text-main)]">
                        {log.skin_type?.trim() || "Skin type not stored"}
                      </h2>
                    </div>
                    <Link href={`/skin-analysis/results/${log.id}`} className="text-sm font-semibold text-[#C06C84]">
                      Open results
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    Concerns: {concerns.length ? concerns.join(", ") : "None stored"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Morning: {am.length ? am.join(", ") : "No products"} · Night: {pm.length ? pm.join(", ") : "No products"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
