import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeShadeKey } from "./keys";

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
    .eq("is_default", true)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await client
    .from("makeup_bags")
    .insert({
      user_id: userId,
      name: "My Makeup Bag",
      is_default: true,
    })
    .select("id")
    .single();

  if (created?.id) return created.id as string;

  // Race: another request created the default bag first.
  const { data: retry } = await client
    .from("makeup_bags")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (retry?.id) return retry.id as string;
  console.error("ensureDefaultBag failed:", error);
  return null;
}

/**
 * Copy paid/placed order line items into the user's default makeup bag.
 * Idempotent via the unique (bag_id, product_key, shade_key) index.
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
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { added: 0, skipped: true, itemIds: [], keys: [], reason: "order_not_found" };
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
      bag_id: bagId,
      product_key: it.product_key as string,
      shade_key: normalizeShadeKey(it.shade_key as string | null),
      source: "purchase" as const,
    }));

  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const k = `${row.product_key}__${row.shade_key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const { data: upserted, error: upsertErr } = await client
    .from("makeup_bag_items")
    .upsert(uniqueRows, {
      onConflict: "bag_id,product_key,shade_key",
      ignoreDuplicates: true,
    })
    .select("id, product_key, shade_key");

  if (upsertErr) {
    // Expression unique index may not be visible to PostgREST ON CONFLICT.
    // Fall back to per-row inserts.
    const insertedIds: string[] = [];
    const keys: string[] = [];
    for (const row of uniqueRows) {
      const { data, error } = await client
        .from("makeup_bag_items")
        .insert({
          user_id: order.user_id,
          bag_id: row.bag_id,
          product_key: row.product_key,
          shade_key: row.shade_key || null,
        })
        .select("id")
        .maybeSingle();
      
      // Ignore unique violations since it just means it's already in the bag
      if (error && error.code !== "23505") {
        continue;
      }
      if (data?.id) {
        insertedIds.push(data.id);
        keys.push(`${row.product_key}__${row.shade_key}`);
      }
    }
    return {
      added: insertedIds.length,
      skipped: false,
      itemIds: insertedIds,
      keys,
    };
  }

  const itemIds = (upserted ?? []).map((r) => r.id as string);
  const keys = uniqueRows.map((r) => `${r.product_key}__${r.shade_key}`);
  return {
    added: itemIds.length || uniqueRows.length,
    skipped: false,
    itemIds,
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
    .eq("is_default", true)
    .maybeSingle();

  if (!bag?.id) return 0;

  const { data: items } = await client
    .from("makeup_bag_items")
    .select("id, product_key, shade_key")
    .eq("bag_id", bag.id)
    .eq("source", "purchase");

  const wanted = new Set(keys);
  const ids = (items ?? [])
    .filter((it) => wanted.has(`${it.product_key}__${it.shade_key ?? ""}`))
    .map((it) => it.id);

  if (ids.length === 0) return 0;

  await client.from("makeup_bag_items").delete().in("id", ids);
  return ids.length;
}

export { ensureDefaultBag };
