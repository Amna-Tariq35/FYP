import { NormalizedLandmark } from "@mediapipe/tasks-vision";

// Exact strings matching your database 'skin_type' column
export type DbSkinType = 
  | "Oily" 
  | "Dry" 
  | "Combination" 
  | "Normal" 
  | "Sensitive" 
  | "Dehydrated"
  | "Acne-Prone";

// Exact strings matching your database 'tags' column values
export type DbSkinConcern = 
  | "oiliness" 
  | "sebum-control"
  | "redness" 
  | "irritation"
  | "pore-blurring" 
  | "dark spots" 
  | "hyperpigmentation"
  | "dryness"
  | "hydration"
  | "acne";

export interface RegionMetrics {
  oiliness: number;
  redness: number;
  texture: number;
}

export interface DetailedSkinAnalysis {
  overallScore: number;
  skinType: DbSkinType;
  primaryConcerns: DbSkinConcern[];
  metrics: {
    oiliness: number;      // 0 = Very Dry, 100 = Extremely Oily
    redness: number;       // 0 = Normal, 100 = Severe Redness
    texture: number;       // 0 = Very Smooth, 100 = Rough/Enlarged Pores
    darkCircles: number;   // 0 = None, 100 = Prominent
    hydration: number;     // Computed inversely
  };
  regionBreakdown: {
    forehead: RegionMetrics;
    tZone: RegionMetrics;
    leftCheek: RegionMetrics;
    rightCheek: RegionMetrics;
    chin: RegionMetrics;
  };
}