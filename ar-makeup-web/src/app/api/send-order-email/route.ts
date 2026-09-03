import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderDetails, userEmail, userName } = await req.json();

    if (!userEmail) {
      return Response.json({ error: 'No email provided' }, { status: 400 });
    }

    const isCOD = orderDetails.payment_method === 'cash_on_delivery';
    const shortId = orderDetails.order_id?.slice(0, 8) || 'N/A';

    await resend.emails.send({
      from: 'AR Makeup <onboarding@resend.dev>', // free tier default
      to: userEmail,
      subject: `${isCOD ? 'Order Placed' : 'Payment Confirmed'} — #${shortId}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          
          <div style="background:linear-gradient(135deg,#C06C84,#e07a90);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
            <h1 style="color:white;margin:0;font-size:22px;">
              ${isCOD ? '🛍️ Order Placed!' : '✅ Payment Confirmed!'}
            </h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">AR Makeup</p>
          </div>

          <p style="color:#444;">Hi <strong>${userName}</strong>,</p>
          <p style="color:#444;">
            ${isCOD
              ? 'Your order has been placed successfully. Please keep cash ready at the time of delivery.'
              : 'Your payment was successful and your order is now confirmed.'}
          </p>

          <div style="background:#FDF2F4;border-radius:10px;padding:16px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#888;">Order Reference</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#C06C84;">
              #${shortId}
            </p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="border-bottom:2px solid #f0e0e5;">
                <th style="text-align:left;padding:8px 4px;font-size:12px;color:#888;">Product</th>
                <th style="text-align:center;padding:8px 4px;font-size:12px;color:#888;">Qty</th>
                <th style="text-align:right;padding:8px 4px;font-size:12px;color:#888;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${orderDetails.items?.map((item: any) => `
                <tr style="border-bottom:1px solid #f5eaed;">
                  <td style="padding:10px 4px;font-size:13px;color:#333;">
                    ${item.name || item.product_name || 'Product'}
                    ${item.shade_name ? `<br><span style="font-size:11px;color:#999;">${item.shade_name}</span>` : ''}
                  </td>
                  <td style="padding:10px 4px;font-size:13px;color:#333;text-align:center;">
                    ${item.quantity}
                  </td>
                  <td style="padding:10px 4px;font-size:13px;color:#333;text-align:right;">
                    $${Number(item.price).toFixed(2)}
                  </td>
                </tr>
              `).join('') || ''}
            </tbody>
          </table>

          <div style="text-align:right;padding:12px 0;border-top:2px solid #f0e0e5;">
            <span style="font-size:18px;font-weight:bold;color:#C06C84;">
              Total: $${Number(orderDetails.total).toFixed(2)}
            </span>
          </div>

          <div style="background:#f9f9f9;border-radius:10px;padding:16px;margin-top:20px;">
            <p style="margin:0;font-size:13px;color:#666;">
              Payment Method: <strong>${isCOD ? 'Cash on Delivery' : 'Online Payment'}</strong>
            </p>
          </div>

          <p style="color:#aaa;font-size:11px;margin-top:24px;text-align:center;">
            AR Makeup • Thank you for shopping with us 💄
          </p>
        </div>
      `,
    });

    return Response.json({ success: true });

  } catch (err) {
    console.error('[send-order-email] Error:', err);
    return Response.json({ error: 'Failed to send email' }, { status: 500 });
  }
}