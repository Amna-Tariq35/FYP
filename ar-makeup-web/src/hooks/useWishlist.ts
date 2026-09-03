"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { useSession } from "@/src/hooks/useSession";

const WISHLIST_KEY = "fyp_makeup_wishlist";

export function useWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);
  const { status } = useSession();
  const userIdRef = useRef<string | null>(null);

  const getKey = (pk: string, sk?: string | null) => `${pk}__${sk || ""}`;
  const migrationFlagKey = (userId: string) =>
    `${WISHLIST_KEY}_migrated_${userId}`;

  // Initial load: DB is source of truth, localStorage sirf guest-migration ke liye
  useEffect(() => {
    const loadWishlist = async () => {
      let localItems: string[] = [];
      try {
        const stored = localStorage.getItem(WISHLIST_KEY);
        if (stored) localItems = JSON.parse(stored);
      } catch {}

      if (status === "signed_in") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          userIdRef.current = user.id;
          const { data } = await supabase
            .from("user_favourites")
            .select("product_key, shade_key")
            .eq("user_id", user.id);

          if (data) {
            const dbSet = new Set(
              data.map((d) => getKey(d.product_key, d.shade_key)),
            );

            // Sirf pehli baar (guest -> logged-in) migrate karo — flag check
            // ke bina yeh block har reload pe chalta tha aur DB se abhi-abhi
            // delete kiya gaya item wapas insert kar deta tha (stale localStorage
            // se), jo app ke realtime listener ko phantom INSERT event bhejta tha.
            const alreadyMigrated = localStorage.getItem(
              migrationFlagKey(user.id),
            );

            if (!alreadyMigrated) {
              const missingInDb = localItems.filter((x) => !dbSet.has(x));
              for (const item of missingInDb) {
                const [pk, sk] = item.split("__");
                await supabase.from("user_favourites").upsert(
                  {
                    user_id: user.id,
                    product_key: pk,
                    shade_key: sk || "", // 🆕 hamesha '', kabhi null nahi
                  },
                  { onConflict: "user_id,product_key,shade_key" },
                );
                dbSet.add(item);
              }
              localStorage.setItem(migrationFlagKey(user.id), "1");
            }

            const finalList = Array.from(dbSet); // DB hi authoritative hai ab
            setWishlist(finalList);
            localStorage.setItem(WISHLIST_KEY, JSON.stringify(finalList));
            return;
          }
        }
      }
      userIdRef.current = null;
      setWishlist(localItems);
    };

    loadWishlist();
  }, [status]);

  // Realtime: DB mein kahin se bhi (app ya doosri tab) change ho, foran reflect ho
  useEffect(() => {
    if (status !== "signed_in") return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;

      channel = supabase
        .channel(`favourites-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_favourites",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const row: any = payload.new ?? payload.old;
            if (!row || row.product_key == null) {
              // fallback: agar payload incomplete mila to safe side pe full refetch kar lo
              return;
            }
            const key = getKey(row.product_key, row.shade_key);

            setWishlist((prev) => {
              let next: string[];
              if (payload.eventType === "DELETE") {
                next = prev.filter((k) => k !== key);
              } else {
                next = prev.includes(key) ? prev : [...prev, key];
              }
              localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
              return next;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [status]);

  const toggle = useCallback(
    async (productKey: string, shadeKey?: string | null) => {
      const isGeneralToggle = shadeKey === undefined;
      const prefix = `${productKey}__`;
      const exactKey = !isGeneralToggle ? getKey(productKey, shadeKey) : null;

      const isCurrentlyWished = isGeneralToggle
        ? wishlist.some((k) => k.startsWith(prefix))
        : wishlist.includes(exactKey!);

      // Optimistic UI update
      setWishlist((prev) => {
        let next;
        if (isCurrentlyWished) {
          next = isGeneralToggle
            ? prev.filter((k) => !k.startsWith(prefix))
            : prev.filter((k) => k !== exactKey);
        } else {
          next = [...prev, isGeneralToggle ? prefix : exactKey!];
        }
        localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
        return next;
      });

      // DB Sync (Bidirectional with App)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        if (isCurrentlyWished) {
          let query = supabase
            .from("user_favourites")
            .delete()
            .eq("user_id", user.id)
            .eq("product_key", productKey);

          if (!isGeneralToggle) {
            // 🆕 hamesha '' se compare karo — '' aur NULL Postgres mein
            // kabhi equal nahi hote, isliye single .eq() consistent hona chahiye
            query = query.eq("shade_key", shadeKey || "");
          }

          await query;
        } else {
          await supabase.from("user_favourites").upsert(
            {
              user_id: user.id,
              product_key: productKey,
              shade_key: isGeneralToggle ? "" : shadeKey || "", // 🆕 null nahi, ''
            },
            { onConflict: "user_id,product_key,shade_key" },
          );
        }
      }
    },
    [wishlist],
  );

  const isWished = useCallback(
    (productKey: string, shadeKey?: string | null) => {
      if (shadeKey === undefined) {
        return wishlist.some((k) => k.startsWith(`${productKey}__`));
      }
      return wishlist.includes(getKey(productKey, shadeKey));
    },
    [wishlist],
  );

  const uniqueCount = new Set(wishlist.map((k) => k.split("__")[0])).size;

  return { wishlist, toggle, isWished, count: uniqueCount };
}
