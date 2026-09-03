"use client";

import { useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";

/**
 * Handoff for "Buy this look".
 *
 * The look page fills the cart and then redirects to checkout, so by the time
 * the user lands on the shipping step there is nothing left on screen to explain
 * where five products just came from. This carries that one sentence across the
 * navigation.
 *
 * sessionStorage, not a query param: the message is a one-time nicety, and a
 * `?fromLook=` in the URL would survive refreshes, get bookmarked, and end up in
 * the Stripe return URL.
 */
const BUY_LOOK_KEY = "ar_makeup_buy_look_v1";

type BuyLookHandoff = {
  lookName: string;
  count: number;
};

/**
 * `undefined` = not looked at yet, `null` = looked and there was nothing.
 *
 * The value has to be cached because it is read through `useSyncExternalStore`,
 * whose snapshot must return a stable reference or React re-renders forever.
 * Caching also does the real work of "show this once": within a single page load
 * the banner can mount, unmount and remount (shipping → payment → back) without
 * announcing the same look again.
 */
let cachedHandoff: BuyLookHandoff | null | undefined;

/** Called by the look page immediately before it redirects to checkout. */
export function markLookAddedToCart(lookName: string, count: number) {
  if (typeof window === "undefined") return;
  // A fresh handoff invalidates the cache, or a second look bought in the same
  // session would re-announce the first one's name.
  cachedHandoff = undefined;
  try {
    const payload: BuyLookHandoff = { lookName, count };
    window.sessionStorage.setItem(BUY_LOOK_KEY, JSON.stringify(payload));
  } catch {
    // Private-browsing quota errors are not worth failing a purchase over.
  }
}

function readAndClear(): BuyLookHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUY_LOOK_KEY);
    if (!raw) return null;
    // Consumed on read, so a full page reload of the checkout does not repeat a
    // message the user has already seen.
    window.sessionStorage.removeItem(BUY_LOOK_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { lookName, count } = parsed as Partial<BuyLookHandoff>;
    if (typeof lookName !== "string" || typeof count !== "number") return null;
    if (!Number.isFinite(count) || count < 1) return null;
    return { lookName, count };
  } catch {
    return null;
  }
}

function getSnapshot(): BuyLookHandoff | null {
  if (cachedHandoff === undefined) cachedHandoff = readAndClear();
  return cachedHandoff;
}

/** Nothing to show on the server: sessionStorage is a browser-only store. */
function getServerSnapshot(): BuyLookHandoff | null {
  return null;
}

/** Write-once-then-read; there is no stream of updates to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

export default function BuyLookBanner() {
  // useSyncExternalStore rather than useState + useEffect: it renders the server
  // snapshot during hydration and swaps in the client value afterwards, which is
  // exactly the shape of "read a browser-only store", and it keeps the read out
  // of an effect body.
  const handoff = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!handoff) return null;

  return (
    <>
      <style>{buyLookBannerStyles}</style>
      <div className="buy-look-banner" role="status">
        <Sparkles className="w-4 h-4 buy-look-banner__icon" aria-hidden="true" />
        <span className="buy-look-banner__text">
          <strong>{handoff.lookName}</strong> added to your cart —{" "}
          {handoff.count} {handoff.count === 1 ? "product" : "products"}
        </span>
      </div>
    </>
  );
}

const buyLookBannerStyles = `
  .buy-look-banner {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px 14px;
    margin-bottom: 16px;
    background: rgba(192,108,132,0.07);
    border: 1px solid rgba(192,108,132,0.28);
    border-radius: 12px;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--text-main);
    line-height: 1.4;
  }
  .buy-look-banner__icon { flex-shrink: 0; color: var(--rose-primary); }
  .buy-look-banner__text strong { font-weight: 600; }
`;
