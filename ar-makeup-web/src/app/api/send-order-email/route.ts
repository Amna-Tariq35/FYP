import { sendEmail } from '@/src/lib/email/brevo';
import { createSupabaseAdminClient } from '@/src/lib/supabase/admin';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';
import { loadCheckoutOrder } from '@/src/lib/orders/checkout-session';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const orderId = typeof body?.order_id === 'string' ? body.order_id.trim() : '';
    const guestToken = typeof body?.guest_token === 'string' ? body.guest_token.trim() : '';

    if (!orderId) {
      return Response.json({ error: 'order_id is required.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createSupabaseAdminClient();
    const loaded = await loadCheckoutOrder(admin, orderId);
    if (loaded.error) {
      return Response.json({ error: 'Could not load the order.' }, { status: 500 });
    }
    const order = loaded.order;
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });

    const ownsOrder = order.user_id
      ? user?.id === order.user_id
      : Boolean(guestToken) && order.guest_token === guestToken;
    if (!user && !guestToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ownsOrder) {
      return Response.json({ error: 'You cannot email this order.' }, { status: 403 });
    }

    const isPaid = order.status === 'paid';
    const isCodDue = order.status === 'placed' && order.payment_method === 'cash_on_delivery';
    if (!isPaid && !isCodDue) {
      return Response.json({ error: 'This order is not confirmed for email.' }, { status: 409 });
    }

    const to = order.contact_email || order.guest_email || (order.user_id ? user?.email ?? null : null);
    if (!to) {
      return Response.json({ error: 'This order has no email address.' }, { status: 409 });
    }

    const { data: items, error: itemsError } = await admin
      .from('order_items')
      .select('name,shade_name,quantity,unit_price,line_total')
      .eq('order_id', orderId);
    if (itemsError) {
      return Response.json({ error: 'Could not load order items.' }, { status: 500 });
    }

    const shortId = escapeHtml(orderId.slice(0, 8));
    const name = escapeHtml(order.shipping_name || 'there');
    const total = Number(order.total ?? 0);
    const rows = (items ?? []).map((item) => {
      const label = escapeHtml(item.name || 'Product');
      const shade = item.shade_name
        ? `<br><span style="font-size:11px;color:#999;">${escapeHtml(item.shade_name)}</span>`
        : '';
      const qty = escapeHtml(item.quantity);
      const price = Number(item.line_total ?? Number(item.unit_price) * Number(item.quantity)).toFixed(2);
      return `
        <tr style="border-bottom:1px solid #f5eaed;">
          <td style="padding:10px 4px;font-size:13px;color:#333;">${label}${shade}</td>
          <td style="padding:10px 4px;font-size:13px;color:#333;text-align:center;">${qty}</td>
          <td style="padding:10px 4px;font-size:13px;color:#333;text-align:right;">$${escapeHtml(price)}</td>
        </tr>
      `;
    }).join('');

    await sendEmail({
      to,
      subject: `${isCodDue ? 'Order placed' : 'Payment confirmed'} — #${orderId.slice(0, 8)}`,
      htmlContent: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <div style="background:linear-gradient(135deg,#C06C84,#e07a90);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px;">
            <h1 style="color:white;margin:0;font-size:22px;">
              ${isCodDue ? 'Order placed' : 'Payment confirmed'}
            </h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">AR Makeup</p>
          </div>
          <p style="color:#444;">Hi <strong>${name}</strong>,</p>
          <p style="color:#444;">
            ${isCodDue
              ? 'Your order is placed. Payment is still due when it is delivered.'
              : 'Your payment was successful and your order is confirmed.'}
          </p>
          <div style="background:#FDF2F4;border-radius:10px;padding:16px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#888;">Order reference</p>
            <p style="margin:4px 0 0;font-size:16px;font-weight:bold;color:#C06C84;">#${shortId}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="border-bottom:2px solid #f0e0e5;">
                <th style="text-align:left;padding:8px 4px;font-size:12px;color:#888;">Product</th>
                <th style="text-align:center;padding:8px 4px;font-size:12px;color:#888;">Qty</th>
                <th style="text-align:right;padding:8px 4px;font-size:12px;color:#888;">Price</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:right;padding:12px 0;border-top:2px solid #f0e0e5;">
            <span style="font-size:18px;font-weight:bold;color:#C06C84;">Total: $${escapeHtml(total.toFixed(2))}</span>
          </div>
          <div style="background:#f9f9f9;border-radius:10px;padding:16px;margin-top:20px;">
            <p style="margin:0;font-size:13px;color:#666;">
              Payment method: <strong>${isCodDue ? 'Cash on delivery — payment still due' : 'Card'}</strong>
            </p>
          </div>
        </div>
      `,
    });

    return Response.json({ success: true });
  } catch (err: unknown) {
    console.error('[send-order-email] Error:', err);
    return Response.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
