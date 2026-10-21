import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

function ownsLog(logUserId: string | null, requesterId: string | null) {
  if (!logUserId) return true;
  return Boolean(requesterId) && logUserId === requesterId;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Service role reads one id. Public RLS must not list every guest row.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("skin_analysis_logs")
    .select("id, user_id, method, skin_type, concern_scores, ai_summary, routine_snapshot, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || !ownsLog(data.user_id, user?.id ?? null)) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  const { user_id: _userId, ...safe } = data;
  return NextResponse.json({ analysis: safe });
}
