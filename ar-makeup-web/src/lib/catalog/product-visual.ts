export type ProductVisualInput = {
  productKey: string;
  name: string;
  category?: string | null;
  imageUrl?: string | null;
};

export type ProductVisual =
  | { kind: "photo"; src: string }
  | {
      kind: "card";
      name: string;
      category: string;
      background: string;
      foreground: string;
    };

/**
 * Blank images and the shared Open Beauty Facts / local placeholder pattern
 * become a generated card. A unique non-empty URL stays a photo.
 * Other duplicate URLs are not scanned catalog-wide.
 */
export function isSharedProductImage(imageUrl: string | null | undefined): boolean {
  const value = (imageUrl ?? "").trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  if (lower.includes("openbeautyfacts") || lower.includes("openfoodfacts")) return true;
  if (lower.includes("product_placeholder") || lower.includes("placeholder-skincare")) return true;
  if (lower.includes("picsum.photos")) return true;
  return false;
}

export function resolveProductVisual(input: ProductVisualInput): ProductVisual {
  const imageUrl = input.imageUrl?.trim() ?? "";
  if (!isSharedProductImage(imageUrl)) {
    return { kind: "photo", src: imageUrl };
  }

  const category = (input.category ?? "").trim() || "Makeup";
  const [r, g, b] = cardRgb(category, input.productKey || input.name);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return {
    kind: "card",
    name: input.name.trim() || "Product",
    category,
    background: `rgb(${r}, ${g}, ${b})`,
    foreground: y > 168 ? "#1F1F1F" : "#FFFFFF",
  };
}

const FAMILIES: { test: RegExp; rgb: [number, number, number] }[] = [
  { test: /lip\s*gloss|gloss/i, rgb: [214, 120, 150] },
  { test: /lipstick|\blip\b/i, rgb: [192, 108, 132] },
  { test: /foundation|concealer/i, rgb: [196, 156, 124] },
  { test: /blush/i, rgb: [214, 132, 150] },
  { test: /mascara|lash/i, rgb: [92, 72, 84] },
  { test: /eyeliner|liner/i, rgb: [74, 64, 78] },
  { test: /eyeshadow|shadow/i, rgb: [154, 112, 146] },
  { test: /highlight/i, rgb: [214, 186, 156] },
  { test: /serum|moistur|cleanser|sunscreen|toner|skincare|mask|cream/i, rgb: [150, 176, 168] },
];

function cardRgb(category: string, seed: string): [number, number, number] {
  const base = FAMILIES.find((row) => row.test.test(category))?.rgb ?? [192, 108, 132];
  const n = hash(seed);
  const delta = (n % 31) - 15;
  return base.map((channel, index) => {
    const extra = ((n >> (index * 5)) & 15) - 7;
    return Math.max(48, Math.min(214, channel + delta + extra));
  }) as [number, number, number];
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
