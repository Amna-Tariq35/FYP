import Image from "next/image";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { MakeupProduct } from "@/src/types/catalog";
import { getProductImageUrl } from "@/src/lib/catalog/image";
import { profileMatchLabels, type ShopperMatchProfile } from "@/src/lib/catalog/product-profile-matching";

type ProductCardProps = {
  product: MakeupProduct;
  isWished?: boolean;
  onWishlistToggle?: (productKey: string) => void;
  onView?: (productKey: string) => void;
  favShadeKey?: string;
  userFinishPreference?: string | null;
  matchProfile?: ShopperMatchProfile | null;
};

export function StarRow({ score, size = 11 }: { score: number; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = score >= n;
        const half = !filled && score >= n - 0.5;
        const base = filled ? "#E8956D" : "#E0D5CF";
        return (
          <span
            key={n}
            style={{
              position: "relative",
              display: "inline-flex",
              width: size,
              height: size,
              flexShrink: 0,
            }}
          >
            <Star size={size} style={{ color: base, fill: base, flexShrink: 0 }} />
            {half && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  width: "50%",
                  display: "inline-flex",
                }}
              >
                <Star
                  size={size}
                  style={{ color: "#E8956D", fill: "#E8956D", flexShrink: 0 }}
                />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function ProductCard({
  product,
  isWished = false,
  onWishlistToggle,
  onView,
  favShadeKey,
  userFinishPreference,
  matchProfile,
}: ProductCardProps) {
  const imageUrl = getProductImageUrl(product.image_url);
  const price =
    typeof product.price === "number" ? `$${product.price.toFixed(2)}` : "—";
  const brand = product.brand?.trim() || "—";
  const category = product.category?.trim() || "Makeup";
  const score = product.rating_average;
  const count = product.review_count;

  const matchLabels = profileMatchLabels(product, matchProfile ?? (
    userFinishPreference ? { finish: userFinishPreference, skinType: null } : null
  ));

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[18px] border border-[var(--border-soft)] bg-[var(--bg-section)] transition-all duration-200 hover:-translate-y-1 hover:border-[#C06C84]/25 hover:shadow-[0_8px_28px_rgba(0,0,0,0.09)]"
      style={{ height: "100%" }}
    >
      {/* ── Wishlist button ── */}
      {onWishlistToggle && (
        <button
          className={[
            "absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-150",
            isWished
              ? "border-[#C06C84]/40 bg-white/95 shadow-sm"
              : "border-white/80 bg-white/90 hover:border-[#C06C84]/35 shadow-sm",
          ].join(" ")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWishlistToggle(product.product_key);
          }}
          aria-label={isWished ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            size={14}
            style={{
              color: isWished ? "#C06C84" : "#b0a0a8",
              fill: isWished ? "#C06C84" : "none",
              transition: "all 0.2s",
            }}
          />
        </button>
      )}

      <Link
        href={
          favShadeKey
            ? `/products/${product.product_key}?shade=${favShadeKey}`
            : `/products/${product.product_key}`
        }
        className="flex flex-col"
        style={{ height: "100%", textDecoration: "none", color: "inherit" }}
        onClick={() => onView?.(product.product_key)}
      >
        {/* ── Image ── */}
        <div
          className="relative overflow-hidden bg-[var(--bg-base)]"
          style={{ aspectRatio: "4/3", flexShrink: 0 }}
        >
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/images/product_placeholder.png";
            }}
            sizes="(max-width: 480px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {/* Category pill */}
          <span
            className="absolute left-3 top-3 max-w-[calc(100%-52px)] truncate rounded-full border border-black/7 bg-white/92 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide"
            style={{ color: "var(--rose-primary)" }}
          >
            {category}
          </span>

          {product.stock_quantity === 0 && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/75 px-2.5 py-0.5 text-[10px] font-semibold text-white">
              Out of stock
            </span>
          )}

          {/* Finish match badge sits on the lower right so it does not cover the wishlist heart. */}
          {matchLabels.length > 0 && (
            <span className="absolute bottom-3 right-3 flex max-w-[70%] flex-col items-end gap-1">
              {matchLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-green-200/50 bg-green-50/95 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-green-700"
                >
                  {label}
                </span>
              ))}
            </span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-0 p-4">
          {/* Brand */}
          <p
            className="mb-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.07em]"
            style={{ color: "var(--text-muted)" }}
          >
            {brand}
          </p>

          {/* Name */}
          <h3
            className="mb-2 text-[14.5px] font-semibold leading-snug"
            style={{
              color: "var(--text-main)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.name}
          </h3>

          {/* Rating */}
          <div className="mb-2.5 flex items-center gap-1.5">
            {product.reviews_available === false ? (
              <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>Reviews unavailable</span>
            ) : score === null || count === 0 ? (
              <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>No reviews yet</span>
            ) : (
              <>
                <StarRow score={score} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--text-main)" }}>{score}</span>
                <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>({count})</span>
              </>
            )}
          </div>

          {/* Description */}
          <p
            className="mb-4 flex-1 text-[12px] font-light leading-[1.55]"
            style={{
              color: "var(--text-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.description || "No description available."}
          </p>

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between gap-2">
            <span
              className="text-[17px] font-bold tracking-tight"
              style={{ color: "var(--rose-primary)" }}
            >
              {price}
            </span>
            <span
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-[12px] font-semibold text-white transition-all duration-150 group-hover:brightness-95"
              style={{ background: "var(--rose-primary)", flexShrink: 0 }}
            >
              View details
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
