// src/lib/catalog/product-profile-matching.ts
import { asStringList } from "@/src/lib/skin-analysis/product-shape";

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

export type ShopperMatchProfile = {
  finish: string | null;
  skinType: string | null;
};

type ProfileReader = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  from: (table: string) => any;
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Signed-in finish and skin type only. Null when signed out. Missing columns fail soft. */
export async function loadShopperMatchProfile(
  supabase: ProfileReader,
): Promise<ShopperMatchProfile | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    let finish: string | null = null;
    let skinType: string | null = null;

    const profile = await supabase
      .from("user_skin_profiles")
      .select("finish_preference, skin_type")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile.error && profile.data) {
      finish = textOrNull(profile.data.finish_preference);
      skinType = textOrNull(profile.data.skin_type);
    } else {
      const finishOnly = await supabase
        .from("user_skin_profiles")
        .select("finish_preference")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!finishOnly.error && finishOnly.data) {
        finish = textOrNull(finishOnly.data.finish_preference);
      }
    }

    if (!skinType) {
      const log = await supabase
        .from("skin_analysis_logs")
        .select("skin_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!log.error && log.data) skinType = textOrNull(log.data.skin_type);
    }

    return { finish, skinType };
  } catch {
    return null;
  }
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Exact finish or skin-type lookup. No score and no undertone guess. */
export function profileMatchLabels(
  product: { finish?: string | null; skin_type?: unknown },
  profile: ShopperMatchProfile | null | undefined,
): string[] {
  if (!profile) return [];
  const labels: string[] = [];
  if (sameText(product.finish, profile.finish)) labels.push("Matches your finish");
  if (
    profile.skinType &&
    asStringList(product.skin_type).some((value) => sameText(value, profile.skinType))
  ) {
    labels.push("Matches your skin type");
  }
  return labels;
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
