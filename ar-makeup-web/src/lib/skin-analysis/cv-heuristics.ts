import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { LANDMARK_REGIONS } from "./face-mesh";
import { DetailedSkinAnalysis, RegionMetrics, DbSkinType, DbSkinConcern } from "@/src/types/skin-analysis";

const UNDER_EYE_LEFT = [33, 130, 246, 161, 160, 159, 158, 157, 173];
const UNDER_EYE_RIGHT = [263, 359, 466, 388, 387, 386, 385, 384, 398];

// All landmark indices used anywhere, combined — sampled once per photo to build
// a per-face calibration baseline (lighting/exposure/contrast), so that every
// region metric below is measured RELATIVE TO THIS FACE, not against a fixed
// universal constant. This is what makes the analysis lighting/camera-invariant.
function getAllFaceIndices(): number[] {
  return [
    ...LANDMARK_REGIONS.FOREHEAD,
    ...LANDMARK_REGIONS.NOSE_T_ZONE,
    ...LANDMARK_REGIONS.LEFT_CHEEK,
    ...LANDMARK_REGIONS.RIGHT_CHEEK,
    ...LANDMARK_REGIONS.CHIN,
  ];
}

interface FaceCalibration {
  medianGray: number;      // this face's own baseline brightness
  grayStdDev: number;      // this face's own contrast/dynamic range
  baselineRedDominance: number; // this face's own natural red-channel bias (skin tone)
}

export function analyzeSkinFromLandmarks(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
): DetailedSkinAnalysis {
  // 0. PASS ONE: calibrate against this specific photo's own face before
  // measuring anything. This replaces every fixed "magic number" threshold
  // that previously existed (e.g. gray > 185, redness - 26) with a value
  // derived from the photo itself, so studio lighting, phone flash, indoor/
  // outdoor shots, and different skin tones don't need separate tuning.
  const calibration = computeFaceCalibration(imageElement, landmarks, getAllFaceIndices());

  // 1. Extract Crop Canvas for each landmark region (with inset protection)
  const foreheadRegion = extractRegionMetrics(imageElement, landmarks, LANDMARK_REGIONS.FOREHEAD, calibration);
  const tZoneRegion = extractRegionMetrics(imageElement, landmarks, LANDMARK_REGIONS.NOSE_T_ZONE, calibration);
  const leftCheekRegion = extractRegionMetrics(imageElement, landmarks, LANDMARK_REGIONS.LEFT_CHEEK, calibration);
  const rightCheekRegion = extractRegionMetrics(imageElement, landmarks, LANDMARK_REGIONS.RIGHT_CHEEK, calibration);
  const chinRegion = extractRegionMetrics(imageElement, landmarks, LANDMARK_REGIONS.CHIN, calibration);

  // 2. Analyze Dark Circles with shadow tolerance (also calibration-aware)
  const darkCirclesScore = analyzeDarkCircles(imageElement, landmarks, calibration);

  // 3. Aggregate Combined Metrics
  const avgOiliness = Math.round((foreheadRegion.oiliness * 0.40) + (tZoneRegion.oiliness * 0.45) + (chinRegion.oiliness * 0.15));
  const avgRedness = Math.round((leftCheekRegion.redness + rightCheekRegion.redness + chinRegion.redness) / 3);
  const avgTexture = Math.round((leftCheekRegion.texture * 0.35 + rightCheekRegion.texture * 0.35 + tZoneRegion.texture * 0.15 + foreheadRegion.texture * 0.15));

  // Realistic Hydration Formula (Balanced against extreme oiliness/dryness)
  const hydrationScore = Math.max(15, Math.min(95, Math.round(85 - (avgTexture * 0.35 + Math.abs(avgOiliness - 35) * 0.3))));

  // 4. Determine Skin Type (Mapped EXACTLY to DB ENUMS)
  const skinType = determineDBSkinType(avgOiliness, tZoneRegion.oiliness, leftCheekRegion.oiliness, avgRedness, hydrationScore, avgTexture);

  // 5. Identify Primary Concerns (Mapped strictly to VALID_TAGS)
  // Conjunctive logic: a single elevated metric (e.g. oiliness from lighting
  // glare) can no longer produce an "acne" or "hyperpigmentation" tag alone.
  const primaryConcerns = identifyDBConcerns(avgOiliness, avgRedness, avgTexture, darkCirclesScore, hydrationScore);

  // 6. Compute Overall Health Score
  const overallScore = Math.max(25, Math.min(98, Math.round(
    100 - (avgRedness * 0.25 + (100 - hydrationScore) * 0.20 + avgTexture * 0.25 + darkCirclesScore * 0.15)
  )));

  return {
    overallScore,
    skinType,
    primaryConcerns,
    metrics: { oiliness: avgOiliness, redness: avgRedness, texture: avgTexture, darkCircles: darkCirclesScore, hydration: hydrationScore },
    regionBreakdown: { forehead: foreheadRegion, tZone: tZoneRegion, leftCheek: leftCheekRegion, rightCheek: rightCheekRegion, chin: chinRegion },
  };
}

// ---------------------------------------------------------
// PASS ONE: per-photo calibration
// ---------------------------------------------------------

function computeFaceCalibration(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
  indices: number[]
): FaceCalibration {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const fallback: FaceCalibration = { medianGray: 150, grayStdDev: 20, baselineRedDominance: 10 };
  if (!ctx || imageSource.width === 0 || imageSource.height === 0) return fallback;

  canvas.width = imageSource.width;
  canvas.height = imageSource.height;
  ctx.drawImage(imageSource, 0, 0);

  const grays: number[] = [];
  const redDominances: number[] = [];

  indices.forEach((idx) => {
    const pt = landmarks[idx];
    if (!pt) return;
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(pt.x * canvas.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(pt.y * canvas.height)));
    // sample a small 3x3 patch around each landmark to reduce single-pixel/JPEG noise
    const size = 3;
    const startX = Math.max(0, x - 1);
    const startY = Math.max(0, y - 1);
    const w = Math.min(size, canvas.width - startX);
    const h = Math.min(size, canvas.height - startY);
    const patch = ctx.getImageData(startX, startY, w, h).data;
    for (let i = 0; i < patch.length; i += 4) {
      const r = patch[i], g = patch[i + 1], b = patch[i + 2];
      grays.push(0.299 * r + 0.587 * g + 0.114 * b);
      redDominances.push(r - (g + b) / 2);
    }
  });

  if (grays.length === 0) return fallback;

  const medianGray = median(grays);
  const grayStdDev = getLuminanceStdDev(grays);
  const baselineRedDominance = median(redDominances);

  return { medianGray, grayStdDev, baselineRedDominance };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------
// PASS TWO: region metrics, measured relative to calibration
// ---------------------------------------------------------

function extractRegionMetrics(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
  indices: number[],
  calibration: FaceCalibration
): RegionMetrics {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imgWidth = imageSource.width;
  const imgHeight = imageSource.height;

  if (!ctx || imgWidth === 0 || imgHeight === 0) return { oiliness: 20, redness: 15, texture: 15 };

  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  indices.forEach((idx) => {
    const pt = landmarks[idx];
    if (pt) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  });

  // Inset: shrink bounding box by 12% inwards to prevent hair/eyebrow pollution
  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.12;
  minX += padX; maxX -= padX;
  minY += padY; maxY -= padY;

  const cropX = Math.floor(minX * imgWidth);
  const cropY = Math.floor(minY * imgHeight);
  const cropW = Math.max(5, Math.ceil((maxX - minX) * imgWidth));
  const cropH = Math.max(5, Math.ceil((maxY - minY) * imgHeight));

  canvas.width = cropW;
  canvas.height = cropH;
  ctx.drawImage(imageSource, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const imageData = ctx.getImageData(0, 0, cropW, cropH);
  const data = imageData.data;
  let totalPixels = data.length / 4;
  if (totalPixels === 0) return { oiliness: 20, redness: 15, texture: 15 };

  let highSpecularCount = 0;
  let totalRednessDominance = 0;
  const grayscaleValues: number[] = new Array(totalPixels);

  // Specular ("oil glare") threshold is now the FACE'S OWN median brightness
  // plus a margin, instead of a fixed number. A bright studio photo has a
  // higher median, so its highlight bar rises with it — a soft beauty-lighting
  // glow on the cheekbones no longer reads the same as a genuinely oily patch.
  const specularThreshold = calibration.medianGray + Math.max(45, calibration.grayStdDev * 1.8);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    grayscaleValues[i / 4] = gray;

    if (gray > specularThreshold && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) highSpecularCount++;

    // Redness measured relative to THIS FACE's own baseline red dominance
    // (sampled across forehead/cheeks/chin/nose in calibration), not a fixed
    // "26" that implicitly assumes one skin tone.
    const rawRedDominance = r - (g + b) / 2;
    totalRednessDominance += Math.max(0, rawRedDominance - calibration.baselineRedDominance);
  }

  const specularRatio = highSpecularCount / totalPixels;
  const oilinessIndex = Math.min(100, Math.round((specularRatio * 240) + (getLuminanceStdDev(grayscaleValues) * 1.0)));
  const rednessIndex = Math.min(100, Math.round((totalRednessDominance / totalPixels) * 1.4));
  const textureIndex = calculateSobelTextureVariance(grayscaleValues, cropW, cropH, calibration);

  return { oiliness: oilinessIndex, redness: rednessIndex, texture: textureIndex };
}

function calculateSobelTextureVariance(
  grayValues: number[],
  width: number,
  height: number,
  calibration: FaceCalibration
): number {
  if (width < 3 || height < 3) return 15;
  let gradientSum = 0, count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -1 * grayValues[(y - 1) * width + (x - 1)] + 1 * grayValues[(y - 1) * width + (x + 1)] +
        -2 * grayValues[y * width + (x - 1)] + 2 * grayValues[y * width + (x + 1)] +
        -1 * grayValues[(y + 1) * width + (x - 1)] + 1 * grayValues[(y + 1) * width + (x + 1)];

      const gy =
        -1 * grayValues[(y - 1) * width + (x - 1)] - 2 * grayValues[(y - 1) * width + x] - 1 * grayValues[(y - 1) * width + (x + 1)] +
         1 * grayValues[(y + 1) * width + (x - 1)] + 2 * grayValues[(y + 1) * width + x] + 1 * grayValues[(y + 1) * width + (x + 1)];

      const grad = Math.sqrt(gx * gx + gy * gy);

      // Noise floor now scales with this face's own contrast (grayStdDev),
      // so a high-contrast studio shot (or watermark/compression noise) doesn't
      // automatically read as more "texture" than a lower-contrast photo of
      // the same actual skin. Floor is bounded so it stays meaningful either way.
      const noiseFloor = Math.min(35, Math.max(18, calibration.grayStdDev * 0.9));
      if (grad > noiseFloor) {
        gradientSum += grad;
        count++;
      }
    }
  }
  return Math.min(100, Math.round((count > 0 ? (gradientSum / count) * 0.9 : 10)));
}

function analyzeDarkCircles(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
  calibration: FaceCalibration
): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 15;

  canvas.width = imageSource.width;
  canvas.height = imageSource.height;
  ctx.drawImage(imageSource, 0, 0);

  const getAverageLuma = (indices: number[]) => {
    let totalLuma = 0, count = 0;
    indices.forEach((idx) => {
      const pt = landmarks[idx];
      if (pt) {
        const x = Math.floor(pt.x * canvas.width);
        const y = Math.floor(pt.y * canvas.height);
        const p = ctx.getImageData(x, y, 1, 1).data;
        totalLuma += 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
        count++;
      }
    });
    return count > 0 ? totalLuma / count : 128;
  };

  const underEyeLuma = (getAverageLuma(UNDER_EYE_LEFT) + getAverageLuma(UNDER_EYE_RIGHT)) / 2;
  const cheekLuma = (getAverageLuma(LANDMARK_REGIONS.LEFT_CHEEK) + getAverageLuma(LANDMARK_REGIONS.RIGHT_CHEEK)) / 2;

  const rawDiff = cheekLuma - underEyeLuma;

  // Shadow tolerance scales with this photo's own contrast (grayStdDev):
  // higher-contrast/directional lighting naturally produces a bigger eye-socket
  // shadow even on completely normal skin, so the tolerance grows with it
  // instead of using one fixed number for every lighting condition.
  const tolerance = Math.max(16, calibration.grayStdDev * 0.9);
  const actualDiff = Math.max(0, rawDiff - tolerance);

  return Math.min(100, Math.round(actualDiff * 1.8));
}

function getLuminanceStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
}

// ---------------------------------------------------------
// THRESHOLDS MATCHED STRICTLY TO DB ENUMS
// (unchanged from before — these now sit on top of calibrated, comparable
// metrics, so they no longer need separate tuning per lighting condition)
// ---------------------------------------------------------

function determineDBSkinType(
  overallOil: number,
  tZoneOil: number,
  cheekOil: number,
  redness: number,
  hydration: number,
  texture: number
): DbSkinType {
  if (overallOil > 60 && redness > 55 && texture > 55) return "Acne-Prone" as DbSkinType;
  if (redness > 65) return "Sensitive" as DbSkinType;
  if (tZoneOil > 55 && cheekOil < 35) return "Combination" as DbSkinType;
  if (overallOil >= 55) return "Oily" as DbSkinType;
  if (hydration < 35) return "Dehydrated" as DbSkinType;
  if (overallOil <= 30) return "Dry" as DbSkinType;
  return "Normal" as DbSkinType;
}

function identifyDBConcerns(oil: number, redness: number, texture: number, darkCircles: number, hydration: number): DbSkinConcern[] {
  const concerns: string[] = [];

  if (oil > 60 && redness > 55 && texture > 55) {
    concerns.push("acne", "Acne Prone");
  }
  if (redness > 58) {
    concerns.push("redness", "irritation");
  }
  if (texture > 58) {
    concerns.push("Exfoliating / Texture", "damaged barrier");
  }
  if (darkCircles > 65) {
    concerns.push("dark spots");
  }
  if (hydration < 40) {
    concerns.push("dryness", "dehydration");
  }
  if (concerns.length === 0) {
    concerns.push("hydration", "glow", "Daily Care", "Hydrating");
  }

  return [...new Set(concerns)] as DbSkinConcern[];
}