"use client";

import { useState } from "react";
import Image from "next/image";
import {
  resolveProductVisual,
  type ProductVisual,
  type ProductVisualInput,
} from "@/src/lib/catalog/product-visual";

export default function ProductImageFace({
  product,
  sizes,
}: {
  product: ProductVisualInput;
  sizes: string;
}) {
  const visual = resolveProductVisual(product);
  const [failed, setFailed] = useState(false);
  if (visual.kind === "card" || failed) {
    const card: ProductVisual =
      visual.kind === "card"
        ? visual
        : resolveProductVisual({ ...product, imageUrl: null });
    if (card.kind !== "card") return null;
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
        style={{ background: card.background }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: card.foreground, opacity: 0.82 }}
        >
          {card.category}
        </p>
        <p className="text-[15px] font-semibold leading-snug" style={{ color: card.foreground }}>
          {card.name}
        </p>
      </div>
    );
  }

  return (
    <Image
      src={visual.src}
      alt={product.name}
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
