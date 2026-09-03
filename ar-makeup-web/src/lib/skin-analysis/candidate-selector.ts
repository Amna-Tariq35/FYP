import { Product, ConcernScores, ExactCategory, RecommendedProduct } from "./recommend";
import { calculateMatchScore } from "./scoring";

export interface ShortlistedCandidates {
  amCandidates: Record<ExactCategory, RecommendedProduct[]>;
  pmCandidates: Record<ExactCategory, RecommendedProduct[]>;
}

export function getTopCandidates(
  products: Product[],
  userSkinType: string,
  concernScores: ConcernScores | string[],
  maxCandidates = 3 // AI ko 3 best options dete hain har slot ke liye
): ShortlistedCandidates {
  
  // 1. Scoring Run Karein (Ab hum matchedTags aur skinTypeMatched dono nikal rahe hain)
  const scoredProducts: RecommendedProduct[] = products.map((p) => {
    const { matchScore, matchedTags, skinTypeMatched } = calculateMatchScore(p, userSkinType, concernScores);
    
    return { 
      ...p, 
      matchScore, 
      matchReason: "", 
      // Temporary fields for advanced sorting (AI engine ya UI ke liye bhi kaam ayenge)
      matchedTagsCount: matchedTags.length,
      isExactSkinMatch: skinTypeMatched
    } as RecommendedProduct & { matchedTagsCount: number, isExactSkinMatch: boolean };
  });

  const categories: ExactCategory[] = [
    "Cleanser",
    "Treatment",
    "Eye cream",
    "Moisturizer",
    "sunscreen",
  ];

  const amCandidates = {} as Record<ExactCategory, RecommendedProduct[]>;
  const pmCandidates = {} as Record<ExactCategory, RecommendedProduct[]>;

  // 2. Multi-Level Sorting Function (The Tie-Breaker)
  const smartSort = (a: any, b: any) => {
    // Primary: Highest Score
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    // Secondary Tie-Breaker: Zyada tags match karne wala better hai
    if (b.matchedTagsCount !== a.matchedTagsCount) {
      return b.matchedTagsCount - a.matchedTagsCount;
    }
    // Tertiary Tie-Breaker: Exact skin type ("Oily") beats Universal ("All Skin Types")
    if (b.isExactSkinMatch && !a.isExactSkinMatch) return 1;
    if (!b.isExactSkinMatch && a.isExactSkinMatch) return -1;
    
    return 0; // Agar sab kuch exact same hai
  };

  // 3. DB Flags ki base par AM & PM Candidates filter aur sort karein
  for (const category of categories) {
    
    // AM Candidates (Filtering using am_safe)
    amCandidates[category] = scoredProducts
      .filter((p) => p.category === category && p.am_safe === true)
      .sort(smartSort)
      .slice(0, maxCandidates);

    // PM Candidates (Filtering using pm_safe & Excluding sunscreen)
    if (category !== "sunscreen") {
      pmCandidates[category] = scoredProducts
        .filter((p) => p.category === category && p.pm_safe === true)
        .sort(smartSort)
        .slice(0, maxCandidates);
    }
  }

  // Cleanup: Temporary fields ko remove kar sakte hain agar chahein, ya AI ke liye chhor sakte hain.
  return { amCandidates, pmCandidates };
}