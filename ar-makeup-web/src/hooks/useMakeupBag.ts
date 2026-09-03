"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useSession } from "@/src/hooks/useSession";
import { bagItemKey, normalizeShadeKey } from "@/src/lib/makeup-bag/keys";
import type { MakeupBagSource } from "@/src/lib/makeup-bag/keys";

const BAG_KEY = "fyp_makeup_bag";

export type MakeupBagItem = {
  id?: string;
  product_key: string;
  shade_key: string;
  source?: MakeupBagSource;
  added_at?: string;
};

let pendingEnsureBag: Promise<string | null> | null = null;

// The "default" bag is identified by name, not a column — matching the DB schema.
const DEFAULT_BAG_NAME = "My Everyday Bag";

async function ensureDefaultBag(userId: string): Promise<string | null> {
  if (pendingEnsureBag) return pendingEnsureBag;

  pendingEnsureBag = (async () => {
    try {
      const { data: existing } = await supabase
        .from("makeup_bags")
        .select("id")
        .eq("user_id", userId)
        .eq("name", DEFAULT_BAG_NAME)
        .maybeSingle();

      if (existing?.id) return existing.id;

      const { data: created, error } = await supabase
        .from("makeup_bags")
        .insert({ user_id: userId, name: DEFAULT_BAG_NAME })
        .select("id")
        .maybeSingle();

      if (created?.id) return created.id;

      // Race condition: another concurrent call may have inserted first.
      const { data: retry, error: retryError } = await supabase
        .from("makeup_bags")
        .select("id")
        .eq("user_id", userId)
        .eq("name", DEFAULT_BAG_NAME)
        .maybeSingle();

      if (retry?.id) return retry.id;

      if (error || retryError) {
        console.error("ensureDefaultBag failed:", error?.message || retryError?.message);
      }
      return null;
    } finally {
      pendingEnsureBag = null;
    }
  })();

  return pendingEnsureBag;
}

function readLocalKeys(): string[] {
  try {
    const stored = localStorage.getItem(BAG_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function writeLocalKeys(keys: string[]) {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(keys));
  } catch {}
}

export function useMakeupBag() {
  const [items, setItems] = useState<MakeupBagItem[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [bagId, setBagId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { status } = useSession();
  const userIdRef = useRef<string | null>(null);

  const applyItems = useCallback((next: MakeupBagItem[]) => {
    const nextKeys = next.map((i) => bagItemKey(i.product_key, i.shade_key));
    setItems(next);
    setKeys(nextKeys);
    writeLocalKeys(nextKeys);
  }, []);

  useEffect(() => {
    const local = readLocalKeys();
    if (local.length) setKeys(local);

    const load = async () => {
      if (status !== "signed_in") {
        userIdRef.current = null;
        setBagId(null);
        setItems([]);
        setKeys(local);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      userIdRef.current = user.id;

      const id = await ensureDefaultBag(user.id);
      setBagId(id);
      if (!id) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("makeup_bag_items")
        .select("id, product_key, shade_key, source, added_at")
        .eq("bag_id", id)
        .order("added_at", { ascending: false });

      applyItems(
        (data ?? []).map((row) => ({
          id: row.id,
          product_key: row.product_key,
          shade_key: row.shade_key ?? "",
          source: (row.source as MakeupBagSource) ?? "manual",
          added_at: row.added_at,
        })),
      );
      setLoading(false);
    };

    load();
  }, [status, applyItems]);

  useEffect(() => {
    if (status !== "signed_in" || !bagId) return;
    const channel = supabase
      .channel(`makeup-bag-${bagId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "makeup_bag_items",
          filter: `bag_id=eq.${bagId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row?.product_key) return;
          const key = bagItemKey(row.product_key, row.shade_key);

          setItems((prev) => {
            let next: MakeupBagItem[];
            if (payload.eventType === "DELETE") {
              next = prev.filter(
                (i) =>
                  bagItemKey(i.product_key, i.shade_key) !== key && i.id !== row.id,
              );
            } else {
              const exists = prev.some(
                (i) => bagItemKey(i.product_key, i.shade_key) === key,
              );
              const mapped: MakeupBagItem = {
                id: row.id,
                product_key: row.product_key,
                shade_key: row.shade_key ?? "",
                source: (row.source as MakeupBagSource) ?? "manual",
                added_at: row.added_at,
              };
              if (exists) {
                next = prev.map((i) =>
                  bagItemKey(i.product_key, i.shade_key) === key ? mapped : i,
                );
              } else {
                next = [mapped, ...prev];
              }
            }
            writeLocalKeys(next.map((i) => bagItemKey(i.product_key, i.shade_key)));
            setKeys(next.map((i) => bagItemKey(i.product_key, i.shade_key)));
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [status, bagId]);

  const isInBag = useCallback(
    (productKey: string, shadeKey?: string | null) => {
      const exact = bagItemKey(productKey, normalizeShadeKey(shadeKey));
      if (keys.includes(exact)) return true;
      // Product-level bag row (empty shade) owns every shade of that product.
      return keys.includes(bagItemKey(productKey, ""));
    },
    [keys],
  );

  const addItem = useCallback(
    async (
      productKey: string,
      shadeKey?: string | null,
      source: MakeupBagSource = "manual",
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { ok: false as const, reason: "auth" as const };

      const sk = normalizeShadeKey(shadeKey);
      const key = bagItemKey(productKey, sk);
      if (keys.includes(key)) return { ok: true as const, already: true };

      setItems((prev) => {
        const next = [
          {
            product_key: productKey,
            shade_key: sk,
            source,
            added_at: new Date().toISOString(),
          },
          ...prev,
        ];
        const nextKeys = next.map((i) => bagItemKey(i.product_key, i.shade_key));
        setKeys(nextKeys);
        writeLocalKeys(nextKeys);
        return next;
      });

      const id = bagId ?? (await ensureDefaultBag(user.id));
      if (id && !bagId) setBagId(id);
      if (!id) return { ok: false as const, reason: "bag" as const };

      const { error } = await supabase.from("makeup_bag_items").insert({
        user_id: user.id,
        bag_id: id,
        product_key: productKey,
        shade_key: sk || null,
        source,
      });

      // 23505 is the PostgreSQL error code for unique_violation
      if (error && error.code === "23505") {
        return { ok: true as const, already: true };
      }

      if (error) {
        console.error("makeup bag add failed:", error);
        setItems((prev) => {
          const next = prev.filter((i) => bagItemKey(i.product_key, i.shade_key) !== key);
          const nextKeys = next.map((i) => bagItemKey(i.product_key, i.shade_key));
          setKeys(nextKeys);
          writeLocalKeys(nextKeys);
          return next;
        });
        return { ok: false as const, reason: "db" as const };
      }
      return { ok: true as const, already: false };
    },
    [bagId, keys],
  );

  const removeItem = useCallback(
    async (productKey: string, shadeKey?: string | null) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const sk = normalizeShadeKey(shadeKey);
      const key = bagItemKey(productKey, sk);

      setItems((prev) => {
        const next = prev.filter((i) => bagItemKey(i.product_key, i.shade_key) !== key);
        const nextKeys = next.map((i) => bagItemKey(i.product_key, i.shade_key));
        setKeys(nextKeys);
        writeLocalKeys(nextKeys);
        return next;
      });

      const id = bagId ?? (await ensureDefaultBag(user.id));
      if (!id) return;

      await supabase
        .from("makeup_bag_items")
        .delete()
        .eq("bag_id", id)
        .eq("product_key", productKey)
        .eq("shade_key", sk);
    },
    [bagId],
  );

  const toggleItem = useCallback(
    async (
      productKey: string,
      shadeKey?: string | null,
      source: MakeupBagSource = "manual",
    ) => {
      if (isInBag(productKey, shadeKey)) {
        await removeItem(productKey, shadeKey);
        return { inBag: false };
      }
      await addItem(productKey, shadeKey, source);
      return { inBag: true };
    },
    [isInBag, removeItem, addItem],
  );

  return {
    items,
    keys,
    bagId,
    loading,
    isInBag,
    addItem,
    removeItem,
    toggleItem,
    count: items.length,
    isSignedIn: status === "signed_in",
  };
}