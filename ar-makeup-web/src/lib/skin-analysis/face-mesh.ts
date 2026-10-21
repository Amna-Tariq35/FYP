import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from "@mediapipe/tasks-vision";

// --- GLOBAL WASM LOG SUPPRESSOR FOR NEXT.JS TURBOPACK ---
// Emscripten/MediaPipe outputs TFLite INFO logs via stderr -> console.error.
// Filtering globally at module load prevents Next.js Turbopack overlay from popping up.
if (typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const firstArg = args[0];
    if (
      typeof firstArg === "string" &&
      (firstArg.includes("XNNPACK") || firstArg.includes("INFO: Created TensorFlow"))
    ) {
      return; // Suppress harmless WASM TFLite delegate logs
    }
    originalConsoleError.apply(console, args);
  };
}

export const LANDMARK_REGIONS = {
  FOREHEAD: [10, 67, 109, 151, 337, 297, 338],
  NOSE_T_ZONE: [1, 2, 4, 6, 9, 10, 168, 197],
  LEFT_CHEEK: [50, 117, 118, 123, 187, 205, 206],
  RIGHT_CHEEK: [280, 346, 347, 352, 411, 425, 426],
  CHIN: [152, 148, 175, 199, 200, 377],
};

export type FaceValidationError = 
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "FACE_TOO_SMALL"
  | "TOO_DARK";

export interface FaceAnalysisResult {
  isValid: boolean;
  error?: FaceValidationError;
  errorMessage?: string;
  landmarks?: NormalizedLandmark[];
  boundingBox?: { x: number; y: number; width: number; height: number };
  averageLuminance?: number;
}

let faceLandmarkerInstance: FaceLandmarker | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarkerInstance) {
    return faceLandmarkerInstance;
  }

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "CPU",
    },
    outputFaceBlendshapes: false,
    runningMode: "IMAGE",
    numFaces: 2,
  });

  return faceLandmarkerInstance;
}

export async function processFaceImage(
  imageSource: HTMLImageElement | HTMLCanvasElement
): Promise<FaceAnalysisResult> {
  try {
    const landmarker = await getFaceLandmarker();
    const result = landmarker.detect(imageSource);

    // 1. Check: No Face Detected
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        isValid: false,
        error: "NO_FACE",
        errorMessage: "No human face detected. Please position your face clearly in the frame.",
      };
    }

    // 2. Check: Multiple Faces
    if (result.faceLandmarks.length > 1) {
      return {
        isValid: false,
        error: "MULTIPLE_FACES",
        errorMessage: "Multiple faces detected. Please ensure only one person is in the frame.",
      };
    }

    const landmarks = result.faceLandmarks[0];

    // 3. Check: Bounding Box & Coverage
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    landmarks.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    });

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    if (boxWidth < 0.15 || boxHeight < 0.15) {
      return {
        isValid: false,
        error: "FACE_TOO_SMALL",
        errorMessage: "Face is too far away. Please move closer to the camera.",
      };
    }

    const luminance = checkImageLuminance(imageSource);
    if (luminance < 40) {
      return {
        isValid: false,
        error: "TOO_DARK",
        errorMessage: "Lighting is too dark. Face a window or turn on a light in front of you.",
        averageLuminance: luminance,
      };
    }
    if (luminance > 225) {
      return {
        isValid: false,
        error: "TOO_DARK",
        errorMessage: "The photo is washed out. Avoid direct flash and face a softer light.",
        averageLuminance: luminance,
      };
    }

    const pose = checkPose(landmarks);
    if (pose) {
      return { isValid: false, error: "NO_FACE", errorMessage: pose };
    }

    const blur = estimateBlur(imageSource, landmarks);
    if (blur < 12) {
      return {
        isValid: false,
        error: "NO_FACE",
        errorMessage: "This photo is too blurry. Hold still and retake it.",
      };
    }

    return {
      isValid: true,
      landmarks,
      boundingBox: {
        x: minX,
        y: minY,
        width: boxWidth,
        height: boxHeight,
      },
      averageLuminance: luminance,
    };
  } catch (err) {
    console.warn("MediaPipe Face Mesh processing error:", err);
    return {
      isValid: false,
      error: "NO_FACE",
      errorMessage: "Failed to analyze face mesh. Please try again with a clearer photo.",
    };
  }
}

function checkImageLuminance(imageSource: HTMLImageElement | HTMLCanvasElement): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 100;

  canvas.width = 100;
  canvas.height = 100;

  ctx.drawImage(imageSource, 0, 0, 100, 100);
  const imageData = ctx.getImageData(0, 0, 100, 100);
  const data = imageData.data;

  let totalLuminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += luma;
  }

  return totalLuminance / (data.length / 4);
}

function checkPose(landmarks: NormalizedLandmark[]): string | null {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  if (!nose || !leftEye || !rightEye) return null;
  const midX = (leftEye.x + rightEye.x) / 2;
  if (Math.abs(nose.x - midX) > 0.08) {
    return "Please face the camera straight on, not from the side.";
  }
  if (Math.abs(leftEye.y - rightEye.y) > 0.06) {
    return "Keep your head level and look straight at the camera.";
  }
  return null;
}

function estimateBlur(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 100;
  const size = 80;
  canvas.width = size;
  canvas.height = size;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  landmarks.forEach((pt) => {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  });
  const sx = Math.max(0, Math.floor(minX * imageSource.width));
  const sy = Math.max(0, Math.floor(minY * imageSource.height));
  const sw = Math.max(1, Math.floor((maxX - minX) * imageSource.width));
  const sh = Math.max(1, Math.floor((maxY - minY) * imageSource.height));
  ctx.drawImage(imageSource, sx, sy, sw, sh, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const gray = new Float32Array(size * size);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let sum = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const lap =
        -4 * gray[y * size + x] +
        gray[(y - 1) * size + x] +
        gray[(y + 1) * size + x] +
        gray[y * size + (x - 1)] +
        gray[y * size + (x + 1)];
      sum += lap * lap;
      count++;
    }
  }
  return count ? sum / count : 0;
}

export function drawLandmarksOnCanvas(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = "rgba(192, 108, 132, 0.7)";
  landmarks.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x * width, pt.y * height, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  });
}