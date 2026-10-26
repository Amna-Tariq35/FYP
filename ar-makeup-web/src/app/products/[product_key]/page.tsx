import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getProductByKey,
  getShadesByProductKey,
} from "@/src/lib/catalog/queries";
import AddToCartPanel from "@/src/components/products/AddToCartPanel";
import ProductImageFace from "@/src/components/products/ProductImageFace";
import ProductReviews from "@/src/components/products/ProductReviews";
import { StarRow } from "@/src/components/products/ProductCard";
import { Suspense } from "react"; // 🆕 add karo
import ShadeCompare from "@/src/components/products/ShadeCompare";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import {
  loadShopperMatchProfile,
  profileMatchLabels,
} from "@/src/lib/catalog/product-profile-matching";

function departmentLabel(mainCategory: string | null) {
  const value = (mainCategory || "").trim().toLowerCase();
  if (value === "skincare") return "Skincare";
  if (value === "makeup") return "Makeup";
  return "Products";
}

type PageProps = {
  params: Promise<{ product_key: string }>;
};

export const revalidate = 60;

export default async function ProductDetailPage(props: PageProps) {
  const params = await props.params; // ✅ unwrap params promise
  const productKey = decodeURIComponent(params.product_key);

  const product = await getProductByKey(productKey);
  if (!product) notFound();

  const shades = await getShadesByProductKey(product.product_key);
  const department = departmentLabel(product.main_category);
  const matchProfile = await loadShopperMatchProfile(await createSupabaseServerClient());
  const matchLabels = profileMatchLabels(product, matchProfile);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <nav className="mb-6 text-sm text-[var(--text-muted)]" aria-label="Breadcrumb">
          <Link href="/products" className="hover:text-[var(--rose-primary)]">
            {department}
          </Link>
          <span className="mx-2" aria-hidden>
            /
          </span>
          <span className="text-[var(--text-main)]">{product.name}</span>
        </nav>
        <div className="grid gap-10 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)]">
            <ProductImageFace
              product={{
                productKey: product.product_key,
                name: product.name,
                category: product.category,
                imageUrl: product.image_url,
              }}
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          <div>
            <p className="text-sm text-[var(--text-muted)]">
              {product.brand || "—"}
            </p>

            <h1 className="mt-1 text-3xl font-semibold text-[var(--text-main)]">
              {product.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[var(--rose-soft)]/40 px-3 py-1 text-sm text-[var(--text-secondary)]">
                {product.category || department}
              </span>
              {matchLabels.map((label) => (
                <span key={label} className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                  {label}
                </span>
              ))}

              {typeof product.price === "number" ? (
                <span className="text-xl font-semibold text-[var(--rose-primary)]">
                  ${product.price.toFixed(2)}
                </span>
              ) : null}

              {product.reviews_available === false ? (
                <span className="text-sm text-[var(--text-muted)]">Reviews unavailable</span>
              ) : product.rating_average === null || product.review_count === 0 ? (
                <span className="text-sm text-[var(--text-muted)]">No reviews yet</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-main)]">
                  <StarRow score={product.rating_average} size={14} />
                  <span className="font-semibold">{product.rating_average}</span>
                  <span className="text-[var(--text-muted)]">({product.review_count})</span>
                </span>
              )}
            </div>

            <p className="mt-5 leading-relaxed text-[var(--text-secondary)]">
              {product.description || "No description available."}
            </p>

            {shades.length >= 2 ? (
              <ShadeCompare product={product} shades={shades} />
            ) : null}

            <div className="mt-8">
              <Suspense
                fallback={
                  <div className="h-[280px] animate-pulse rounded-2xl bg-[var(--bg-section)]" />
                }
              >
                <AddToCartPanel product={product} shades={shades} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-12">
        <ProductReviews productKey={product.product_key} />
      </div>
    </main>
  );
}
