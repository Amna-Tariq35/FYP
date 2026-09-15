import { NextResponse } from "next/server";
import { verifyAdmin } from "@/src/lib/adminAuth";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { notifyRestockAlerts } from "@/src/lib/inventory/restock";

export async function POST(request: Request) {
  const auth = await verifyAdmin(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const productKey = typeof body.product_key === "string" ? body.product_key.trim() : "";
    if (!productKey) {
      return NextResponse.json({ error: "product_key is required." }, { status: 400 });
    }

    const result = await notifyRestockAlerts(createSupabaseAdminClient(), productKey);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("Restock notification failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not send restock notifications.",
      },
      { status: 500 },
    );
  }
}
