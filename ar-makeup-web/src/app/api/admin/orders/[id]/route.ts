import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> } // Next.js 15 requires Promise here
) {
   // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);
  
  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    // AWAIT the params object
    const resolvedParams = await params;
    const orderId = resolvedParams.id;

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    // 1. Order details fetch karein
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // 2. Order items fetch karein
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError) throw itemsError;

    return NextResponse.json({ order, items });
  } catch (error: any) {
    console.error("Fetch Order Details Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}