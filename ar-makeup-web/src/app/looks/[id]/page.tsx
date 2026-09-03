"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShoppingBag,
  Plus,
  Check,
  ImageOff,
  Layers,
  Tag,
  AlertCircle,
} from "lucide-react";
import { SavedLook, LookItemWithProduct } from "../../../types";
import { ProductShade } from "@/src/types/catalog";
import { supabase } from "../../../lib/supabase/client";
import { addToCart } from "@/src/store/cart";
import { markLookAddedToCart } from "@/src/components/checkout/BuyLookBanner";

const PRODUCTS_TABLE  = "makeup_products";
const PRODUCT_KEY_COL = "product_key";
const SHADES_TABLE    = "product_shades";
const SHADE_KEY_COL   = "shade_key";

/**
 * Shown when an item's `shade_key` no longer matches a `product_shades` row —
 * the catalog moved on after the look was saved. Deliberately not "No Shade":
 * the item *does* have a shade, we just cannot name it, and mislabelling it
 * would send the wrong colour to the cart display.
 */
const UNKNOWN_SHADE_NAME = "Shade unavailable";

/** `shade_key` is only unique within a product, so pair it with the product. */
function shadeMapKey(productKey: string, shadeKey: string) {
  return `${productKey}__${shadeKey}`;
}

/**
 * Outcome of the app's "Buy complete look" handoff (`?action=buy`).
 *
 * The app sends the user here through /auth/bridge, so by the time this page
 * runs, the session is live and the cart — which is localStorage — is reachable.
 * Three things can happen:
 *
 *  - every product still exists  → fill the cart and go straight to checkout
 *  - some products have gone     → fill the cart with what is left and *stay*,
 *                                  so the user can see what is missing and
 *                                  decide, rather than being dropped into a
 *                                  checkout with a total they did not expect
 *  - nothing is left             → explain, and do not redirect at all
 */
type BuyState =
  | { kind: "idle" }
  | { kind: "redirecting"; count: number }
  | { kind: "partial"; available: number; total: number }
  | { kind: "unavailable" };

/** `look_name` can be empty — the app lets a look be saved without a name. */
function lookLabel(look: SavedLook | null): string {
  return look?.look_name?.trim() || "Your look";
}

function safeHex(hex?: string | null): string | null {
  if (!hex) return null;
  const h = hex.trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(h)) return h.startsWith("#") ? h : `#${h}`;
  return null;
}

function sanitizeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.length > 2000) return null;
  let url = raw.trim().replace(/^['"]|['"]$/g, "");
  url = url.replace(/^(https?):\/([^/])/, "$1://$2");
  try { new URL(url); return url; } catch { return null; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type Toast = { id: number; message: string; type: "success" | "error" };

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.type === "success" ? (
            <Check className="w-4 h-4 toast-icon" />
          ) : (
            <AlertCircle className="w-4 h-4 toast-icon" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Product image with fallback ───────────────────────────────────────────────
function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const cleanSrc = sanitizeImageUrl(src);
  const [errored, setErrored] = useState(false);
  if (!cleanSrc || errored) {
    return (
      <div className="product-img-fallback">
        <ImageOff className="w-5 h-5" style={{ color: "var(--border-soft)" }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cleanSrc}
      alt={alt}
      className="product-img"
      onError={() => setErrored(true)}
    />
  );
}

// ── Look hero image with fallback ─────────────────────────────────────────────
function LookHeroImage({ src, alt }: { src?: string | null; alt: string }) {
  const cleanSrc = sanitizeImageUrl(src);
  const [errored, setErrored] = useState(false);
  if (!cleanSrc || errored) {
    return (
      <div className="look-hero-fallback">
        <ImageOff className="w-10 h-10" style={{ color: "var(--border-soft)" }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
          No preview available
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cleanSrc}
      alt={alt}
      className="look-hero-img"
      onError={() => setErrored(true)}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [look, setLook] = useState<SavedLook | null>(null);
  const [items, setItems] = useState<LookItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [allAdded, setAllAdded] = useState(false);
  const [buyState, setBuyState] = useState<BuyState>({ kind: "idle" });

  /**
   * `addToCart` *increments* quantity for a product/shade already in the cart,
   * so running the buy handoff twice would silently double every line. React 19
   * StrictMode double-invokes effects in development, which is exactly that bug.
   */
  const buyHandled = useRef(false);

  const pushToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const tid = Date.now();
    setToasts((prev) => [...prev, { id: tid, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== tid)), 3000);
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchLookDetails = async () => {
      try {
        const { data: lookData, error: lookError } = await supabase
          .from("saved_looks")
          .select("*")
          .eq("id", id)
          .single();

        if (lookError || !lookData) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setLook(lookData as SavedLook);

        const { data: itemsData, error: itemsError } = await supabase
          .from("saved_look_items")
          .select("*")
          .eq("look_id", id)
          .order("layer_order", { ascending: true });

        if (itemsError) throw itemsError;

        if (!itemsData || itemsData.length === 0) {
          setItems([]);
          return;
        }

        const productKeys = itemsData.map((item) => item.product_key).filter(Boolean);

        const { data: productsData, error: productsError } = await supabase
          .from(PRODUCTS_TABLE)
          .select("*")
          .in(PRODUCT_KEY_COL, productKeys);

        if (productsError) {
          console.error(
            `Products fetch failed. Check PRODUCTS_TABLE ("${PRODUCTS_TABLE}") ` +
            `and PRODUCT_KEY_COL ("${PRODUCT_KEY_COL}") at top of file.`,
            productsError
          );
          throw productsError;
        }

        // Resolve the shades the look actually used. Without this the page can
        // only add products to the cart as "No Shade" — which is wrong for a
        // look built out of specific shades, and would ship the wrong colour.
        const shadeKeys = Array.from(
          new Set(itemsData.map((item) => item.shade_key).filter(Boolean))
        ) as string[];

        const shadesByKey = new Map<string, ProductShade>();

        if (shadeKeys.length > 0) {
          // Failing to resolve a shade must not take the whole page down: the
          // products are already loaded and still worth showing.
          const { data: shadesData, error: shadesError } = await supabase
            .from(SHADES_TABLE)
            .select("id,shade_key,product_key,shade_name,shade_hex")
            .in(PRODUCT_KEY_COL, productKeys)
            .in(SHADE_KEY_COL, shadeKeys);

          if (shadesError) {
            console.error(
              `Shades fetch failed. Check SHADES_TABLE ("${SHADES_TABLE}").`,
              shadesError
            );
          } else {
            for (const shade of (shadesData ?? []) as ProductShade[]) {
              shadesByKey.set(
                shadeMapKey(shade.product_key, shade.shade_key),
                shade
              );
            }
          }
        }

        const formattedItems: LookItemWithProduct[] = itemsData.map((item) => ({
          ...item,
          product:
            productsData?.find((p) => p[PRODUCT_KEY_COL] === item.product_key) ?? null,
          shade: item.shade_key
            ? shadesByKey.get(shadeMapKey(item.product_key, item.shade_key)) ?? null
            : null,
        }));

        setItems(formattedItems);
      } catch (err) {
        console.error("Error fetching look details:", err);
        pushToast("Failed to load look details.", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchLookDetails();
  }, [id, pushToast]);

  /**
   * Cart payload for one look item.
   *
   * `shade_key` comes straight from the saved item — it is NOT NULL in the
   * database, so the look's actual shade is always what goes in the cart. This
   * is the 0.5 fix: the page used to hardcode `"no-shade"` here, which quietly
   * added the wrong colour and, because the cart dedups on
   * `product_key__shade_key`, also split one shade into two line items when the
   * same product was added from its product page.
   *
   * Only the human-readable name can fail, and only when the shade row itself
   * has gone missing from the catalog.
   */
  const cartPayloadFor = useCallback((item: LookItemWithProduct, quantity = 1) => {
    const p = item.product!;
    return {
      product_key: p.product_key,
      shade_key:   item.shade_key,
      shade_name:  item.shade?.shade_name ?? UNKNOWN_SHADE_NAME,
      quantity,
      name:        p.name,
      brand:       p.brand,
      price:       p.price,
      image_url:   p.image_url,
    };
  }, []);

  const handleAddToCart = useCallback(
    (item: LookItemWithProduct) => {
      if (!item.product) return;
      addToCart(cartPayloadFor(item));
      setAddedIds((prev) => new Set(prev).add(item.id));
      pushToast(`"${item.product.name}" added to cart`);
    },
    [cartPayloadFor, pushToast]
  );

  const handleAddAllToCart = useCallback(() => {
    const validItems = items.filter((i) => i.product);
    if (validItems.length === 0) return;
    validItems.forEach((item) => addToCart(cartPayloadFor(item)));
    setAddedIds(new Set(validItems.map((i) => i.id)));
    setAllAdded(true);
    pushToast(`${validItems.length} product${validItems.length > 1 ? "s" : ""} added to cart`);
  }, [items, cartPayloadFor, pushToast]);

  // ── "Buy this look" handoff from the app ────────────────────────────────────
  //
  // The app opens {WEB}/auth/bridge#…&next=/looks/{id}?action=buy. The bridge
  // installs the session and forwards here, so this runs signed in.
  useEffect(() => {
    if (loading || notFound || buyHandled.current) return;

    // Read straight from the URL rather than useSearchParams(): this is a
    // one-shot client-only read, and useSearchParams() would require wrapping
    // the whole page in a Suspense boundary to keep `next build` happy.
    const search = new URLSearchParams(window.location.search);
    if (search.get("action") !== "buy") return;

    buyHandled.current = true;

    // Strip the parameter *before* touching the cart. The ref guard does not
    // survive a reload, and a refresh with ?action=buy still in the URL would
    // add every product a second time.
    search.delete("action");
    const qs = search.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    );

    const validItems = items.filter((i) => i.product);
    if (validItems.length === 0) {
      setBuyState({ kind: "unavailable" });
      return;
    }

    validItems.forEach((item) => addToCart(cartPayloadFor(item)));
    setAddedIds(new Set(validItems.map((i) => i.id)));
    setAllAdded(true);

    if (validItems.length === items.length) {
      markLookAddedToCart(lookLabel(look), validItems.length);
      setBuyState({ kind: "redirecting", count: validItems.length });
      // replace, not push: the back button should return to My Looks, not to a
      // URL that re-triggers the handoff.
      router.replace("/checkout/shipping");
      return;
    }

    // Something in the look is gone. The cart holds what survived; the banner
    // below says so, and the user chooses whether that is still worth buying.
    setBuyState({
      kind: "partial",
      available: validItems.length,
      total: items.length,
    });
  }, [loading, notFound, items, look, cartPayloadFor, router]);

  const continueToCheckout = useCallback(() => {
    if (buyState.kind !== "partial") return;
    markLookAddedToCart(lookLabel(look), buyState.available);
    router.push("/checkout/shipping");
  }, [buyState, look, router]);

  const totalPrice = items.reduce((sum, item) => sum + (item.product?.price ?? 0), 0);
  const validItemCount = items.filter((i) => i.product).length;

  if (loading) {
    return (
      <>
        <style>{detailStyles}</style>
        <div className="detail-page detail-page--center">
          <div className="spinner" />
        </div>
      </>
    );
  }

  if (notFound || !look) {
    return (
      <>
        <style>{detailStyles}</style>
        <div className="detail-page detail-page--center">
          <div className="not-found-box">
            <ImageOff className="w-10 h-10" style={{ color: "var(--border-soft)", marginBottom: 16 }} />
            <h2 className="not-found-title">Look not found</h2>
            <p className="not-found-desc">This look may have been deleted or doesn&apos;t exist.</p>
            <Link href="/my-looks" className="not-found-back">
              <ArrowLeft className="w-4 h-4" /> Return to My Looks
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Every product was available, so we are on our way to checkout. Showing the
  // full look page for one frame first would read as a glitch.
  if (buyState.kind === "redirecting") {
    return (
      <>
        <style>{detailStyles}</style>
        <div className="detail-page detail-page--center">
          <div className="not-found-box">
            <div className="spinner" />
            <p className="redirect-note">
              Added {buyState.count}{" "}
              {buyState.count === 1 ? "product" : "products"} to your cart —
              taking you to checkout…
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{detailStyles}</style>
      <ToastContainer toasts={toasts} />

      <div className="detail-page">
        <div className="detail-container">

          <Link href="/my-looks" className="back-link">
            <ArrowLeft className="w-4 h-4" /> Back to My Looks
          </Link>

          <div className="detail-card">

            {/* Left — Hero image */}
            <div className="detail-left">
              <LookHeroImage src={look.preview_image_url} alt={look.look_name ?? "Look preview"} />
            </div>

            {/* Right — Details */}
            <div className="detail-right">

              {/* Outcome of the app's "Buy complete look" handoff. Absent on a
                  normal visit — buyState only leaves "idle" via ?action=buy. */}
              {buyState.kind === "partial" && (
                <div className="buy-notice" role="status">
                  <AlertCircle className="w-4 h-4 buy-notice__icon" aria-hidden="true" />
                  <div className="buy-notice__body">
                    <p className="buy-notice__title">
                      {buyState.available} of {buyState.total} products available
                    </p>
                    <p className="buy-notice__desc">
                      The rest are no longer in our catalog. What is still
                      available is already in your cart.
                    </p>
                    <button onClick={continueToCheckout} className="buy-notice__btn">
                      Continue to checkout
                      <span className="add-all-count">{buyState.available}</span>
                    </button>
                  </div>
                </div>
              )}

              {buyState.kind === "unavailable" && (
                <div className="buy-notice buy-notice--empty" role="status">
                  <AlertCircle className="w-4 h-4 buy-notice__icon" aria-hidden="true" />
                  <div className="buy-notice__body">
                    <p className="buy-notice__title">This look can&apos;t be bought right now</p>
                    <p className="buy-notice__desc">
                      None of its products are in our catalog any more. The look
                      itself is safe — you can still wear it in the app.
                    </p>
                    <Link href="/products" className="buy-notice__btn">
                      Browse products
                    </Link>
                  </div>
                </div>
              )}

              {/* Name + tags */}
              <div className="detail-header">
                <h1 className="detail-title">{look.look_name || "Untitled Look"}</h1>
                {look.tags && look.tags.length > 0 && (
                  <div className="detail-tags">
                    {look.tags.map((tag, i) => (
                      <span key={i} className="detail-tag">
                        <Tag className="w-2.5 h-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Products */}
              <div className="products-section">
                <div className="products-section-header">
                  <Layers className="w-4 h-4" style={{ color: "var(--rose-primary)" }} />
                  <h3 className="products-section-title">Products Used</h3>
                  {validItemCount > 0 && (
                    <span className="products-count">{validItemCount}</span>
                  )}
                </div>

                {items.length === 0 || validItemCount === 0 ? (
                  <p className="no-products">No products found for this look.</p>
                ) : (
                  <div className="products-list">
                    {items.map((item) => {
                      if (!item.product) return null;
                      const isAdded = addedIds.has(item.id);
                      const hex = safeHex(item.shade?.shade_hex);
                      return (
                        <div key={item.id} className="product-row">
                          <ProductImage src={item.product.image_url} alt={item.product.name} />
                          <div className="product-info">
                            <h4 className="product-name">{item.product.name}</h4>
                            <div className="product-meta">
                              <span className="product-category">{item.product.category}</span>
                              {item.intensity != null && (
                                <>
                                  <span className="meta-dot">·</span>
                                  <span>Intensity: {item.intensity}%</span>
                                </>
                              )}
                            </div>
                            {/* Always rendered: every saved item carries a
                                shade_key, so the row is never absent — only its
                                name and swatch can be unresolvable. */}
                            <div className="product-shade">
                              {hex && (
                                <span
                                  className="shade-dot"
                                  style={{ background: hex }}
                                  aria-hidden="true"
                                />
                              )}
                              <span
                                className={
                                  item.shade
                                    ? "shade-name"
                                    : "shade-name shade-name--unknown"
                                }
                              >
                                {item.shade?.shade_name ?? UNKNOWN_SHADE_NAME}
                              </span>
                            </div>
                            <div className="product-price">
                              ${(item.product.price ?? 0).toFixed(2)}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddToCart(item)}
                            className={`add-btn ${isAdded ? "add-btn--added" : ""}`}
                            aria-label={
                              isAdded
                                ? "Added to cart"
                                : `Add ${item.product.name}${
                                    item.shade ? ` in ${item.shade.shade_name}` : ""
                                  } to cart`
                            }
                          >
                            {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="detail-footer">
                <div className="total-row">
                  <span className="total-label">Total Look Value</span>
                  <span className="total-price">${totalPrice.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleAddAllToCart}
                  disabled={validItemCount === 0 || allAdded}
                  className={`add-all-btn ${allAdded ? "add-all-btn--done" : ""}`}
                >
                  {allAdded ? (
                    <>
                      <Check className="w-5 h-5" /> All Added to Cart
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5" />
                      Add All to Cart
                      {validItemCount > 0 && (
                        <span className="add-all-count">{validItemCount}</span>
                      )}
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const detailStyles = `
  .detail-page {
    min-height: 100vh;
    background: var(--bg-base);
    padding: 80px 16px 64px;
  }
  .detail-page--center {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .detail-container { max-width: 1200px; margin: 0 auto; }

  @keyframes ld-spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 40px; height: 40px;
    border-radius: 50%;
    border: 2.5px solid var(--border-soft);
    border-top-color: var(--rose-primary);
    animation: ld-spin 0.75s linear infinite;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
    margin-bottom: 24px;
    transition: color 0.15s;
  }
  .back-link:hover { color: var(--rose-primary); }

  .not-found-box {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .not-found-title {
    font-size: 19px;
    font-weight: 600;
    color: var(--text-main);
    margin: 0 0 8px;
  }
  .not-found-desc { font-size: 13.5px; color: var(--text-muted); margin: 0 0 20px; font-weight: 300; }
  .not-found-back {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 600;
    color: var(--rose-primary); text-decoration: none;
    transition: opacity 0.15s;
  }
  .not-found-back:hover { opacity: 0.75; }

  .redirect-note {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-muted);
    margin: 18px 0 0;
    max-width: 260px;
    line-height: 1.5;
  }

  .buy-notice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 15px;
    background: rgba(192,108,132,0.07);
    border: 1px solid rgba(192,108,132,0.28);
    border-radius: 14px;
  }
  .buy-notice--empty {
    background: rgba(239,68,68,0.06);
    border-color: rgba(239,68,68,0.24);
  }
  .buy-notice__icon { flex-shrink: 0; margin-top: 1px; color: var(--rose-primary); }
  .buy-notice--empty .buy-notice__icon { color: #ef4444; }
  .buy-notice__body { flex: 1; min-width: 0; }
  .buy-notice__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-main);
    margin: 0 0 3px;
  }
  .buy-notice__desc {
    font-size: 12px;
    font-weight: 300;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0;
  }
  .buy-notice__btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 11px;
    padding: 8px 15px;
    background: var(--rose-primary);
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 12.5px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .buy-notice__btn:hover { opacity: 0.88; }

  .detail-card {
    background: var(--bg-section);
    border: 1px solid var(--border-soft);
    border-radius: 24px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  }
  @media (min-width: 1024px) { .detail-card { flex-direction: row; } }

  .detail-left {
    flex-shrink: 0;
    width: 100%;
    min-height: 320px;
    overflow: hidden;
    background: var(--bg-base);
  }
  @media (min-width: 1024px) {
    .detail-left { width: 42%; min-height: 580px; }
  }
  .look-hero-img {
    width: 100%; height: 100%;
    object-fit: cover; display: block;
    min-height: inherit;
  }
  .look-hero-fallback {
    width: 100%; height: 100%;
    min-height: inherit;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }

  .detail-right {
    flex: 1;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    overflow-y: auto;
  }
  @media (min-width: 1024px) { .detail-right { padding: 36px 40px; } }

  .detail-title {
    font-size: clamp(20px, 2.8vw, 28px);
    font-weight: 600;
    color: var(--text-main);
    letter-spacing: -0.015em;
    line-height: 1.2;
    margin: 0 0 14px;
  }
  .detail-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .detail-tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 11px;
    background: var(--bg-base);
    border: 1px solid var(--border-soft);
    border-radius: 99px;
    font-size: 11.5px; font-weight: 500;
    color: var(--text-muted);
  }

  .products-section { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .products-section-header { display: flex; align-items: center; gap: 8px; }
  .products-section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-main);
    margin: 0;
  }
  .products-count {
    margin-left: 2px;
    background: var(--bg-base);
    border: 1px solid var(--border-soft);
    border-radius: 99px;
    font-size: 10.5px; font-weight: 600;
    color: var(--text-muted);
    padding: 1px 8px;
    line-height: 18px;
  }
  .no-products { font-size: 13px; color: var(--text-muted); font-style: italic; font-weight: 300; }
  .products-list { display: flex; flex-direction: column; gap: 9px; }

  .product-row {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 11px 13px;
    background: var(--bg-base);
    border: 1px solid var(--border-soft);
    border-radius: 14px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .product-row:hover {
    border-color: rgba(192,108,132,0.28);
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }

  .product-img {
    width: 56px; height: 56px;
    border-radius: 11px;
    object-fit: cover;
    border: 1px solid var(--border-soft);
    flex-shrink: 0;
  }
  .product-img-fallback {
    width: 56px; height: 56px;
    border-radius: 11px;
    border: 1px solid var(--border-soft);
    background: var(--bg-section);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .product-info { flex: 1; min-width: 0; }
  .product-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-main);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin: 0 0 3px;
  }
  .product-meta {
    font-size: 11px; color: var(--text-muted);
    display: flex; align-items: center; gap: 4px;
    text-transform: capitalize;
    margin-bottom: 4px;
    font-weight: 400;
  }
  .meta-dot { opacity: 0.4; }

  .product-shade {
    display: flex; align-items: center; gap: 5px;
    margin-bottom: 4px;
  }
  .shade-dot {
    width: 11px; height: 11px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(0,0,0,0.14);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
  }
  .shade-name {
    font-size: 11px;
    font-weight: 500;
    color: var(--rose-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* An unresolved shade must not read like a real shade name. */
  .shade-name--unknown {
    color: var(--text-muted);
    font-style: italic;
    font-weight: 400;
  }

  .product-price { font-size: 13px; font-weight: 600; color: var(--rose-primary); }

  .add-btn {
    width: 34px; height: 34px; flex-shrink: 0;
    border-radius: 10px;
    border: 1px solid var(--border-soft);
    background: var(--bg-section);
    color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all 0.18s;
  }
  .add-btn:hover {
    border-color: var(--rose-primary);
    color: var(--rose-primary);
    background: rgba(192,108,132,0.07);
  }
  .add-btn--added {
    border-color: #22c55e;
    background: rgba(34,197,94,0.09);
    color: #22c55e;
  }
  .add-btn--added:hover {
    border-color: #22c55e;
    color: #22c55e;
    background: rgba(34,197,94,0.14);
  }

  .detail-footer {
    border-top: 1px solid var(--border-soft);
    padding-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: auto;
  }
  .total-row {
    display: flex; align-items: center; justify-content: space-between;
  }
  .total-label { font-size: 12.5px; font-weight: 400; color: var(--text-muted); }
  .total-price {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-main);
    letter-spacing: -0.015em;
  }

  .add-all-btn {
    width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 13px 24px;
    background: var(--rose-primary);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 13.5px; font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, background 0.2s;
  }
  .add-all-btn:hover:not(:disabled) { opacity: 0.88; }
  .add-all-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .add-all-btn--done { background: #22c55e; }
  .add-all-btn--done:hover:not(:disabled) { opacity: 0.88; }
  .add-all-count {
    background: rgba(255,255,255,0.22);
    border-radius: 99px;
    font-size: 10.5px; font-weight: 700;
    padding: 1px 8px; line-height: 18px;
  }

  .toast-container {
    position: fixed;
    bottom: 24px; right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 9px;
    pointer-events: none;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .toast {
    display: flex; align-items: center; gap: 9px;
    padding: 11px 16px;
    border-radius: 13px;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 18px rgba(0,0,0,0.12);
    animation: toast-in 0.22s ease;
    max-width: 300px;
    background: #fff;
    color: #1a1a1a;
  }
  .toast--success { border: 1px solid rgba(34,197,94,0.28); }
  .toast--error   { border: 1px solid rgba(239,68,68,0.28); }
  .toast-icon { flex-shrink: 0; }
  .toast--success .toast-icon { color: #22c55e; }
  .toast--error   .toast-icon { color: #ef4444; }
`;