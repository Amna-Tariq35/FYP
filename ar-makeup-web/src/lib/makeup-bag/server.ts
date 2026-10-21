import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BAG_NAME, normalizeShadeKey } from "./keys";

export type PurchaseBagResult = {
  added: number;
  skipped: boolean;
  itemIds: string[];
  keys: string[];
  reason?: string;
};

async function ensureDefaultBag(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await client
    .from("makeup_bags")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DEFAULT_BAG_NAME)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // Same identity as the browser hook. Live SQL has no is_default column.
  const { data: created, error } = await client
    .from("makeup_bags")
    .insert({
      user_id: userId,
      name: DEFAULT_BAG_NAME,
    })
    .select("id")
    .maybeSingle();

  if (created?.id) return created.id as string;

  const { data: retry } = await client
    .from("makeup_bags")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DEFAULT_BAG_NAME)
    .maybeSingle();

  if (retry?.id) return retry.id as string;
  console.error("ensureDefaultBag failed:", error);
  return null;
}

const BAG_ELIGIBLE_STATUSES = new Set(["paid", "processing", "shipped", "delivered"]);

/**
 * Copy paid order line items into the user's default makeup bag.
 * Unpaid (placed) orders are skipped. Idempotent for keys already in the bag.
 */
export async function addOrderItemsToDefaultBag(
  client: SupabaseClient,
  orderId: string,
  opts: { addToBag?: boolean } = {},
): Promise<PurchaseBagResult> {
  if (opts.addToBag === false) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "opted_out" };
  }

  const { data: order, error: orderErr } = await client
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "order_not_found" };
  }

  if (!BAG_ELIGIBLE_STATUSES.has(String(order.status || "").toLowerCase())) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "unpaid" };
  }

  if (!order.user_id) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "guest_order" };
  }

  const { data: items, error: itemsErr } = await client
    .from("order_items")
    .select("id, product_key, shade_key")
    .eq("order_id", orderId);

  if (itemsErr || !items?.length) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "no_items" };
  }

  const bagId = await ensureDefaultBag(client, order.user_id);
  if (!bagId) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "no_bag" };
  }

  const rows = items
    .filter((it) => it.product_key)
    .map((it) => ({
      user_id: order.user_id as string,
      bag_id: bagId,
      product_key: it.product_key as string,
      shade_key: normalizeShadeKey(it.shade_key as string | null),
    }));

  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const k = `${row.product_key}__${row.shade_key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Direct insert: repo SQL does not define add_item_to_bag. shade_key is '' not null.
  // user_id matches the live items table. Skip keys already in the bag so a
  // missing unique constraint cannot create a second row.
  const { data: existingItems } = await client
    .from("makeup_bag_items")
    .select("id, product_key, shade_key")
    .eq("bag_id", bagId);
  const existingKeys = new Set(
    (existingItems ?? []).map((item) => `${item.product_key}__${item.shade_key ?? ""}`),
  );

  const insertedIds: string[] = [];
  const keys: string[] = [];
  for (const row of uniqueRows) {
    const key = `${row.product_key}__${row.shade_key}`;
    if (existingKeys.has(key)) {
      keys.push(key);
      continue;
    }
    const { data, error } = await client
      .from("makeup_bag_items")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error && error.code !== "23505") {
      console.error("makeup bag purchase insert failed:", error.message);
      continue;
    }
    keys.push(key);
    if (data?.id) insertedIds.push(data.id);
  }

  return {
    added: insertedIds.length,
    skipped: false,
    itemIds: insertedIds,
    keys,
  };
}

export async function removePurchaseItemsFromBag(
  client: SupabaseClient,
  userId: string,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;

  const { data: bag } = await client
    .from("makeup_bags")
    .select("id")
    .eq("user_id", userId)
    .eq("name", DEFAULT_BAG_NAME)
    .maybeSingle();

  if (!bag?.id) return 0;

  // Live items have no source column, so undo matches product and shade keys.
  const { data: items } = await client
    .from("makeup_bag_items")
    .select("id, product_key, shade_key")
    .eq("bag_id", bag.id);

  const wanted = new Set(keys);
  const ids = (items ?? [])
    .filter((it) => wanted.has(`${it.product_key}__${it.shade_key ?? ""}`))
    .map((it) => it.id);

  if (ids.length === 0) return 0;

  await client.from("makeup_bag_items").delete().in("id", ids);
  return ids.length;
}

export { ensureDefaultBag };
