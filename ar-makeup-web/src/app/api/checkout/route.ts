import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover', // Aapka latest Stripe version
});

export async function POST(request: Request) {
  try {
    const { items, orderId, addToMakeupBag } = await request.json();

    // Cart items ko Stripe format mein convert kar rahe hain
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: item.image_url ? [item.image_url] : [],
        },
        unit_amount: Math.round(item.price * 100), // Price in cents
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
    
  } catch (error: any) {
    console.error("Stripe Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}