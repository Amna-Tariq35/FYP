import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/email/brevo";

type RestockAlert = {
  id: string;
  email: string | null;
  user_id: string | null;
  product_key: string;
  shade_key: string | null;
};

type RestockProduct = {
  name: string;
  brand: string | null;
};

function describeEmailFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Email request failed.";
  return {
    message,
    statusCode: null,
  };
}

async function sendRestockEmail(
  recipientEmail: string,
  productDetails: RestockProduct,
  productKey: string,
) {
  return sendEmail({
    to: recipientEmail,
    subject: `${productDetails.name} is back in stock`,
    htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h1 style="color:#C06C84;font-size:22px;">Back in stock</h1>
        <p>${productDetails.name}${productDetails.brand ? ` by ${productDetails.brand}` : ""} is available again.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/products/${encodeURIComponent(productKey)}" style="color:#C06C84;">Shop now</a></p>
      </div>`,
  });
}

export async function notifyRestockAlerts(
  supabaseAdmin: SupabaseClient,
  productKey: string,
) {
  const [{ data: alerts, error: alertsError }, { data: product, error: productError }] =
    await Promise.all([
      supabaseAdmin
        .from("product_restock_alerts")
        .select("id,email,user_id,product_key,shade_key")
        .eq("product_key", productKey)
        .is("notified_at", null),
      supabaseAdmin
        .from("makeup_products")
        .select("name,brand")
        .eq("product_key", productKey)
        .single(),
    ]);

  if (alertsError) throw alertsError;
  if (productError) throw productError;

  const pendingAlerts = (alerts ?? []) as RestockAlert[];
  const productDetails = product as RestockProduct;
  let notified = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ alertId: string; message: string; statusCode: number | null }> = [];
  const sent: Array<{ alertId: string; recipientEmail: string; messageId?: string }> = [];

  for (const alert of pendingAlerts) {
    try {
      let recipientEmail = alert.email;

      if (!recipientEmail && alert.user_id) {
        const { data: authUser, error: authUserError } =
          await supabaseAdmin.auth.admin.getUserById(alert.user_id);
        if (authUserError) throw authUserError;
        recipientEmail = authUser.user?.email ?? null;
      }

      if (!recipientEmail) {
        skipped += 1;
        console.error("Restock alert has no recipient email", {
          alertId: alert.id,
          userId: alert.user_id,
        });
        continue;
      }

      const emailResult = await sendRestockEmail(recipientEmail, productDetails, productKey);

      const { error: updateError } = await supabaseAdmin
        .from("product_restock_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", alert.id)
        .is("notified_at", null);

      if (updateError) throw updateError;
      notified += 1;
      sent.push({
        alertId: alert.id,
        recipientEmail,
        messageId: emailResult.messageId,
      });
    } catch (error) {
      failed += 1;
      const failure = describeEmailFailure(error);
      errors.push({ alertId: alert.id, ...failure });
      console.error("Restock alert failed", { alertId: alert.id, error });
    }
  }

  return { pending: pendingAlerts.length, notified, failed, skipped, errors, sent };
}
