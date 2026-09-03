// src/lib/catalog/product-profile-matching.ts
/**
 * Beauty Profile Product Matching
 * 
 * Scores products based on user's beauty profile preferences:
 * - Finish preference (matte, dewy, satin)
 * - Undertone matching (for future AI-powered recommendations)
 */

export interface ProductFinishScore {
  productKey: string;
  finishScore: number; // 0-30 points
  finishBadge?: string; // e.g., "Matches your finish"
  finishMatch: boolean; // Exact match or not
}

/**
 * Score a product based on user's finish preference
 * 
 * Finish matching:
 * - Exact match (user='dewy', product='dewy'): +30 points
 * - Similar finish (matte ≈ satin): +15 points
 * - No match: +0 points
 */
export function scoreProductByFinish(
  productFinish: string | null | undefined,
  userFinishPreference: string | null | undefined
): ProductFinishScore {
  // If either is null/undefined, return no score
  if (!productFinish || !userFinishPreference) {
    return {
      productKey: '',
      finishScore: 0,
      finishMatch: false,
    };
  }

  const normalize = (finish: string) => finish.toLowerCase().trim();
  const userFin = normalize(userFinishPreference);
  const prodFin = normalize(productFinish);

  // Exact match
  if (userFin === prodFin) {
    return {
      productKey: '',
      finishScore: 30,
      finishBadge: `✓ Matches your ${userFin} preference`,
      finishMatch: true,
    };
  }

  // Similar finishes: matte ≈ satin (both are non-glossy)
  const mattySatin = ['matte', 'satin'];
  if (
    mattySatin.includes(userFin) &&
    mattySatin.includes(prodFin) &&
    userFin !== prodFin
  ) {
    return {
      productKey: '',
      finishScore: 15,
      finishBadge: `Similar to your ${userFin} preference`,
      finishMatch: false,
    };
  }

  // No match
  return {
    productKey: '',
    finishScore: 0,
    finishMatch: false,
  };
}

/**
 * Filter products by user's finish preference.
 * 
 * Usage:
 * ```
 * const userProfile = { finish_preference: 'dewy' };
 * const allProducts = [...];
 * const filtered = filterByFinishPreference(allProducts, userProfile.finish_preference);
 * ```
 */
export function filterByFinishPreference(
  products: Array<{ product_key: string; finish?: string | null }>,
  userFinishPreference: string | null | undefined
): Array<{ product_key: string; finish?: string | null }> {
  if (!userFinishPreference) {
    return products;
  }

  const normalize = (finish: string) => finish.toLowerCase().trim();
  const userFin = normalize(userFinishPreference);

  return products.filter((product) => {
    const prodFin = normalize(product.finish || '');
    return prodFin === userFin;
  });
}

/**
 * Sort products by finish preference match.
 * Exact matches first, then similar, then no match.
 */
export function sortByFinishMatch(
  products: Array<{ product_key: string; finish?: string | null }>,
  userFinishPreference: string | null | undefined
): Array<{ product_key: string; finish?: string | null; finishScore?: number }> {
  if (!userFinishPreference) {
    return products;
  }

  return [...products].sort((a, b) => {
    const scoreA = scoreProductByFinish(a.finish, userFinishPreference)
      .finishScore;
    const scoreB = scoreProductByFinish(b.finish, userFinishPreference)
      .finishScore;
    return scoreB - scoreA; // Higher score first
  });
}

/**
 * Undertone matching for future use.
 * Currently a placeholder for foundation matching when hex color is available.
 * 
 * Future: Map undertones to product characteristics
 * - Cool undertone: Prefer pinks, berries, silvers
 * - Warm undertone: Prefer corals, peachs, golds
 * - Neutral undertone: Can wear both
 * - Olive undertone: Prefer greens, earths
 */
export interface UndertoneProductMatch {
  undertone: string;
  preferredTones: string[]; // e.g., ['pinks', 'berries', 'silvers']
  description: string;
}

export const UNDERTONE_PREFERENCES: Record<string, UndertoneProductMatch> = {
  cool: {
    undertone: 'cool',
    preferredTones: ['pinks', 'berries', 'reds', 'plums', 'silvers'],
    description: 'Favors cool-toned shades with blue and purple undertones',
  },
  warm: {
    undertone: 'warm',
    preferredTones: ['corals', 'peaches', 'oranges', 'golds', 'warm reds'],
    description: 'Favors warm-toned shades with orange and golden undertones',
  },
  neutral: {
    undertone: 'neutral',
    preferredTones: [
      'pinks',
      'corals',
      'peaches',
      'berries',
      'reds',
      'golds',
      'silvers',
    ],
    description: 'Can wear both cool and warm tones beautifully',
  },
  olive: {
    undertone: 'olive',
    preferredTones: ['greens', 'olives', 'browns', 'golds', 'warm metallics'],
    description: 'Favors earthy and muted tones that complement olive undertone',
  },
};
