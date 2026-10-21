import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';
import { releaseAndCancelPlacedOrder } from '@/src/lib/orders/cancel-placed';

const ADMIN_ORDER_STATUSES = [
  'placed',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'failed',
] as const;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
   // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);
  
  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { order_id, status } = await request.json();

    if (!order_id || !status) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (!ADMIN_ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: "That status is not available." }, { status: 400 });
    }

    if (status === 'cancelled') {
      const cancelled = await releaseAndCancelPlacedOrder(String(order_id));
      if (!cancelled.ok) {
        return NextResponse.json({ error: cancelled.error }, { status: cancelled.status });
      }
      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status: status })
      .eq('id', order_id);

    if (error) throw error;

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    console.error("Update Status Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}