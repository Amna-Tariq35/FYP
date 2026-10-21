import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "PGRST204" ||
    code === "42703" ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

export type CheckoutOrder = {
  id: string;
  user_id: string | null;
  guest_token: string | null;
  guest_email: string | null;
  status: string;
  total: number | null;
  shipping_name: string | null;
  payment_method: string | null;
  stripe_checkout_session_id: string | null;
  contact_email: string | null;
};

const BASE_COLUMNS = "id,user_id,guest_token,guest_email,status,total,shipping_name";
const EXTRA_COLUMNS = `${BASE_COLUMNS},payment_method,stripe_checkout_session_id,contact_email`;

export async function loadCheckoutOrder(
  admin: SupabaseClient,
  orderId: string,
): Promise<{ order: CheckoutOrder | null; error: string | null }> {
  const rich = await admin.from("orders").select(EXTRA_COLUMNS).eq("id", orderId).maybeSingle();
  if (!rich.error) {
    return { order: (rich.data as CheckoutOrder | null) ?? null, error: null };
  }
  if (!isMissingColumnError(rich.error)) {
    return { order: null, error: rich.error.message };
  }

  const basic = await admin.from("orders").select(BASE_COLUMNS).eq("id", orderId).maybeSingle();
  if (basic.error) return { order: null, error: basic.error.message };
  if (!basic.data) return { order: null, error: null };
  return {
    order: {
      ...(basic.data as Omit<CheckoutOrder, "payment_method" | "stripe_checkout_session_id" | "contact_email">),
      payment_method: null,
      stripe_checkout_session_id: null,
      contact_email: null,
    },
    error: null,
  };
}

/** Writes optional checkout columns. Missing columns are ignored so checkout still runs before db/009. */
export async function stampCheckoutFields(
  admin: SupabaseClient,
  orderId: string,
  fields: {
    payment_method?: string | null;
    stripe_checkout_session_id?: string | null;
    contact_email?: string | null;
  },
) {
  const payload: Record<string, string | null> = {};
  if (fields.payment_method !== undefined) payload.payment_method = fields.payment_method;
  if (fields.stripe_checkout_session_id !== undefined) {
    payload.stripe_checkout_session_id = fields.stripe_checkout_session_id;
  }
  if (fields.contact_email !== undefined) payload.contact_email = fields.contact_email;
  if (Object.keys(payload).length === 0) return;

  const { error } = await admin.from("orders").update(payload).eq("id", orderId);
  if (!error || isMissingColumnError(error)) return;
  console.error("stampCheckoutFields:", error.message);
}
