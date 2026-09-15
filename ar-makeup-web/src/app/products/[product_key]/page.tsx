import { notFound } from "next/navigation";
import Image from "next/image";
import {
  getProductByKey,
  getShadesByProductKey,
} from "@/src/lib/catalog/queries";
import { getProductImageUrl } from "@/src/lib/catalog/image";
import AddToCartPanel from "@/src/components/products/AddToCartPanel";
import ProductReviews from "@/src/components/products/ProductReviews";
import { Suspense } from "react"; // 🆕 add karo

type PageProps = {
  params: Promise<{ product_key: string }>;
};

export default async function ProductDetailPage(props: PageProps) {
  const params = await props.params; // ✅ unwrap params promise
  const productKey = decodeURIComponent(params.product_key);

  const product = await getProductByKey(productKey);
  if (!product) notFound();

  const shades = await getShadesByProductKey(product.product_key);
  const imageUrl = getProductImageUrl(product.image_url);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)]">
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              className="object-cover"
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

            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-[var(--rose-soft)]/40 px-3 py-1 text-sm text-[var(--text-secondary)]">
                {product.category || "Makeup"}
              </span>

              {typeof product.price === "number" ? (
                <span className="text-xl font-semibold text-[var(--rose-primary)]">
                  ${product.price.toFixed(2)}
                </span>
              ) : null}
            </div>

            <p className="mt-5 leading-relaxed text-[var(--text-secondary)]">
              {product.description || "No description available."}
            </p>

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
