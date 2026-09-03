// lib/skin-analysis/recommend.ts

export type ExactCategory =
  | "Cleanser"
  | "Eye cream"
  | "sunscreen"
  | "Moisturizer"
  | "Treatment";

// Database Product Interface
export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ExactCategory;
  price: number;
  image_url: string;
  skin_type: string[];
  tags: string[];
  ingredients: string;
  am_safe: boolean; // DB Column
  pm_safe: boolean; // DB Column
}

export type ConcernScores = Record<string, number>;

export interface RecommendedProduct extends Product {
  matchScore: number;
  matchReason: string;
}

export interface SkincareRoutine {
  amRoutine: RecommendedProduct[];
  pmRoutine: RecommendedProduct[];
}