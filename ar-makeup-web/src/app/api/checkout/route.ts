import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover', // Aapka latest Stripe version
});

export async function POST(request: Request) {
  let orderIdForCleanup: string | null = null;
  try {
    const { orderId, addToMakeupBag } = await request.json();
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }
    orderIdForCleanup = orderId;

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: persistedItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('name,image_url,unit_price,quantity')
      .eq('order_id', orderId);
    if (itemsError) throw itemsError;
    if (!persistedItems?.length) {
      return NextResponse.json({ error: 'Order has no items' }, { status: 400 });
    }

    // Cart items ko Stripe format mein convert kar rahe hain
    const lineItems = persistedItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: item.image_url ? [item.image_url] : [],
        },
        unit_amount: Math.round(Number(item.unit_price) * 100),
      },
      quantity: item.quantity,
    }));

    // Stripe Checkout Session create kar rahe hain
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      
      // Success URL: Jab payment successful ho jaye
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      
      // Cancel URL: Jab user bina pay kiye back aa jaye (Yahan humne orderId pass kiya hai)
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel?order_id=${orderId}`,
      
      metadata: {
        orderId,
        add_to_makeup_bag: addToMakeupBag === false ? "false" : "true",
      },
    });

    // Frontend ko seedha Stripe ka URL return kar rahe hain
    return NextResponse.json({ url: session.url }); 
    
  } catch (error: unknown) {
    if (orderIdForCleanup) {
      try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('status')
          .eq('id', orderIdForCleanup)
          .maybeSingle();
        if (order?.status === 'placed') {
          const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select('product_key,quantity')
            .eq('order_id', orderIdForCleanup);
          for (const item of orderItems ?? []) {
            await supabaseAdmin.rpc('release_product_stock', {
              p_product_key: item.product_key,
              p_quantity: item.quantity,
            });
          }
          await supabaseAdmin
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', orderIdForCleanup)
            .eq('status', 'placed');
        }
      } catch (cleanupError) {
        console.error('Failed to release checkout reservation:', cleanupError);
      }
    }
    console.error("Stripe Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe checkout failed." }, { status: 500 });
  }
}