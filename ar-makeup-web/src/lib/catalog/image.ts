export function getProductImageUrl(
  image_url: string | null | undefined,
  category?: string | null
): string {
  // 1. Agar valid image URL mojood hai, toh wahi return karein
  if (image_url && image_url.trim().length > 0) {
    return image_url;
  }

  // 2. Skincare categories ki list
  const skincareCategories = [
    'moisturizer',
    'cleanser',
    'sunscreen',
    'treatment',
    'toner',
    'eye cream',
    'serum',
    'face mask',
    'mask',
  ];

  const cleanCategory = (category || '').trim().toLowerCase();
  const isSkincare = skincareCategories.includes(cleanCategory);

  // 3. Category ke mutabiq sahi fallback return karein
  if (isSkincare) {
    return '/images/placeholder-skincare.svg'; // Agar /images folder mein rakha hai toh '/images/placeholder-skincare.svg' kar dein
  }

  // Makeup / Default fallback
  return '/images/product_placeholder.png';
}