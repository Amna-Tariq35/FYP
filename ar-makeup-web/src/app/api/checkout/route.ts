import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { releaseAndCancelPlacedOrder } from '@/src/lib/orders/cancel-placed';
import { loadCheckoutOrder, stampCheckoutFields } from '@/src/lib/orders/checkout-session';
import { markOrderPaidFromCheckoutSession } from '@/src/lib/orders/mark-paid';

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const guestToken = typeof body?.guest_token === 'string' ? body.guest_token : '';
    const addToMakeupBag = body?.addToMakeupBag;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const supabaseAdmin = createSupabaseAdminClient();

    const loaded = await loadCheckoutOrder(supabaseAdmin, orderId);
    if (loaded.error) {
      return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 });
    }
    const order = loaded.order;
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const ownsOrder = order.user_id
      ? user?.id === order.user_id
      : Boolean(guestToken) && order.guest_token === guestToken;

    if (!ownsOrder) {
      return NextResponse.json({ error: 'You cannot pay for this order.' }, { status: 403 });
    }

    if (order.status !== 'placed') {
      return NextResponse.json({ error: 'Only a placed order can be sent to checkout.' }, { status: 409 });
    }

    if (order.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
        if (existing.metadata?.orderId === orderId && existing.payment_status === 'paid') {
          await markOrderPaidFromCheckoutSession(existing, orderId);
          return NextResponse.json({ error: 'This order is already paid.' }, { status: 409 });
        }
        if (existing.metadata?.orderId === orderId && existing.status === 'open' && existing.url) {
          return NextResponse.json({ url: existing.url });
        }
        if (existing.status === 'expired') {
          await releaseAndCancelPlacedOrder(orderId);
          return NextResponse.json(
            { error: 'This checkout expired and the reserved stock was released.' },
            { status: 409 },
          );
        }
      } catch (error) {
        console.error('Existing Stripe session could not be reused:', error);
      }
      return NextResponse.json(
        { error: 'A checkout session already exists for this order.' },
        { status: 409 },
      );
    }

    const { data: persistedItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('name,image_url,unit_price,quantity')
      .eq('order_id', orderId);
    if (itemsError) {
      return NextResponse.json({ error: 'Could not load order items.' }, { status: 500 });
    }
    if (!persistedItems?.length) {
      return NextResponse.json({ error: 'Order has no items' }, { status: 400 });
    }

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

    const guestQuery = guestToken ? `&guest_token=${encodeURIComponent(guestToken)}` : '';

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel?order_id=${orderId}${guestQuery}`,
        metadata: {
          orderId,
          add_to_makeup_bag: addToMakeupBag === false ? "false" : "true",
        },
      });
    } catch (stripeError: unknown) {
      try {
        await releaseAndCancelPlacedOrder(orderId);
      } catch (cleanupError) {
        console.error('Failed to release checkout reservation:', cleanupError);
      }
      console.error("Stripe Error:", stripeError);
      return NextResponse.json({
        error: stripeError instanceof Error ? stripeError.message : "Stripe checkout failed.",
      }, { status: 500 });
    }

    if (!session.url) {
      try {
        await releaseAndCancelPlacedOrder(orderId);
      } catch (cleanupError) {
        console.error('Failed to release checkout reservation:', cleanupError);
      }
      return NextResponse.json({ error: "Stripe checkout failed." }, { status: 500 });
    }

    await stampCheckoutFields(supabaseAdmin, orderId, {
      stripe_checkout_session_id: session.id,
      payment_method: 'card',
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Checkout error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Stripe checkout failed.",
    }, { status: 500 });
  }
}
