import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';

// Admin client jo RLS bypass kar sakta hai
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // .env.local mein yeh key lazmi honi chahiye
);

export async function POST(request: Request) {
   // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);
  
  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { id, is_active } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Supabase mein is_active status update karein
    const { error } = await supabaseAdmin
      .from('makeup_products')
      .update({ is_active: is_active })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, is_active });
  } catch (error: any) {
    console.error("Toggle Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}