import { Product, ConcernScores } from "./recommend";
import { ScoringResult } from "./scoring";

/**
 * Step 2: Match Reason Generator
 * Ye function user ko batayega ke ye product uske liye kyu select hua.
 */
export function generateMatchReason(
  product: Product,
  concernScores: ConcernScores,
  scoringResult: ScoringResult
): string {
  const { matchedTags, skinTypeMatched } = scoringResult;

  // 1. Sab se pehle user ka "Top Concern" nikalte hain jiska score sab se zyada ho
  let topConcern = "";
  let maxScore = 0;
  
  for (const [concern, score] of Object.entries(concernScores)) {
    if (score > maxScore) {
      maxScore = score;
      topConcern = concern;
    }
  }

  // Concern ke naam ko thora saaf karna (e.g., "dark_spots" -> "Dark Spots")
  const formattedConcern = topConcern
    .replace("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  // 2. Reason Banane ki Priority Logic
  
  // Priority 1: Agar user ka masla serious hai (score > 0.5) aur tags bhi match ho gaye hain
  if (maxScore > 0.5 && matchedTags.length > 0) {
    const mainBenefit = matchedTags[0].toLowerCase(); // e.g., "oil-free"
    return `Targets your ${formattedConcern} (${mainBenefit})`;
  } 
  
  // Priority 2: Agar masla serious nahi, par achay tags match hue hain (e.g., "hydration", "glow")
  if (matchedTags.length >= 2) {
    return `Features ${matchedTags[0]} & ${matchedTags[1]} benefits`;
  } else if (matchedTags.length === 1) {
    return `Provides excellent ${matchedTags[0]} benefits`;
  } 
  
  // Priority 3: Agar sirf skin type match hui hai (e.g., user is Dry, product is Dry)
  if (skinTypeMatched) {
    return `Ideal match for your skin profile`;
  }

  // Fallback: Agar upar se kuch match na ho
  return `Great addition to your daily routine`;
}