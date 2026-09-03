import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth'; // Helper import kiya



const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request:Request) {
      // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);
  
  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    // Saare orders fetch karein
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, total, status, created_at, shipping_name')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let totalRevenue = 0;
    let pendingOrdersCount = 0;
    let totalOrders = orders.length;

    orders.forEach(order => {
      // Revenue sirf un orders ka count karein jo paid/shipped/delivered hain
      if (['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
        totalRevenue += Number(order.total || 0);
      }
      
      // Pending orders wo hain jo abhi process ho rahe hain
      if (['placed', 'paid', 'processing'].includes(order.status)) {
        pendingOrdersCount++;
      }
    });

    // Top 5 recent orders dashboard par dikhane ke liye
    const recentOrders = orders.slice(0, 5);

    return NextResponse.json({
      totalRevenue,
      totalOrders,
      pendingOrdersCount,
      recentOrders
    });

  } catch (error: any) {
    console.error("Dashboard Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}