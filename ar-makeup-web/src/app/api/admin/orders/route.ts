import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';

// Service Role Key use kar rahe hain taake RLS bypass ho jaye
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);

  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // Saare orders fetch karein (RLS bypass ho jayegi)
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, status, total, currency, shipping_name, created_at, guest_email')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ orders: data });
  } catch (error: any) {
    console.error("Fetch Orders Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}