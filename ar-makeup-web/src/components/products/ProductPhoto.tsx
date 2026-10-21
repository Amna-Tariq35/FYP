"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductPhoto({ src, alt }: { src: string; alt: string }) {
  const [imageSrc, setImageSrc] = useState(src);

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      className="object-cover"
      sizes="(max-width: 768px) 100vw, 50vw"
      onError={() => setImageSrc("/images/product_placeholder.png")}
    />
  );
}
