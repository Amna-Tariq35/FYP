import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    // Update order status to 'cancelled' in Supabase
    const { error } = await supabaseAdmin
      .from('orders') // Apne table ka naam check kar lein
      .update({ status: 'cancelled' })
      .eq('id', order_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Cancel Order Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}