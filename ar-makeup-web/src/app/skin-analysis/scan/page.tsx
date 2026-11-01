"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { compressImage } from "@/src/lib/image-utils";
import { processFaceImage, drawLandmarksOnCanvas, FaceAnalysisResult } from "@/src/lib/skin-analysis/face-mesh";
import { analyzeSkinFromLandmarks } from "@/src/lib/skin-analysis/cv-heuristics";
import { canonicalConcern } from "@/src/lib/skin-analysis/contract";
import { Camera, Upload, ShieldCheck, AlertCircle, RefreshCw, ServerCrash } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ScanPage() {
  const router = useRouter();
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [hasConsent, setHasConsent] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // State for API Quota Exceeded & Unavailable Fallback
  const [isQuotaError, setIsQuotaError] = useState(false);
  const [offerQuestionnaire, setOfferQuestionnaire] = useState(false);

  const questionnaireSkinTypes = new Set(["Oily", "Dry", "Combination", "Normal", "Sensitive"]);
  const questionnaireConcerns = new Set([
    "acne",
    "oiliness",
    "dryness",
    "dehydration",
    "redness",
    "rosacea",
    "irritation",
    "damaged barrier",
    "dullness",
    "dark spots",
    "sun-damage",
    "anti-aging",
  ]);

  const videoConstraints = {
    width: 1080,
    height: 1920,
    facingMode: "user",
  };

  const processAndValidateCapture = async (source: string | File) => {
    let objectUrl: string | null = null;
    try {
      setIsProcessing(true);
      setValidationError(null);
      setIsQuotaError(false);
      setOfferQuestionnaire(false);

      setProcessingStage("Checking your face");
      const compressedBlob = await compressImage(source, 1024);
      
      const imgElement = new Image();
      objectUrl = URL.createObjectURL(compressedBlob);
      imgElement.src = objectUrl;

      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });

      const faceResult: FaceAnalysisResult = await processFaceImage(imgElement);

      if (!faceResult.isValid || !faceResult.landmarks) {
        setValidationError(faceResult.errorMessage || "Skin scan failed validation.");
        setPreviewImage(null);
        return;
      }

      // Render Overlay Mesh for verification
      if (canvasRef.current) {
        canvasRef.current.width = imgElement.width;
        canvasRef.current.height = imgElement.height;
        const ctx = canvasRef.current.getContext("2d");
        ctx?.drawImage(imgElement, 0, 0);
        drawLandmarksOnCanvas(canvasRef.current, faceResult.landmarks);
      }

      const analysisReport = analyzeSkinFromLandmarks(imgElement, faceResult.landmarks);

      const maxSide = 1024;
      const scale = Math.min(1, maxSide / imgElement.width, maxSide / imgElement.height);
      const uploadWidth = Math.max(1, Math.round(imgElement.width * scale));
      const uploadHeight = Math.max(1, Math.round(imgElement.height * scale));
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = uploadWidth;
      tempCanvas.height = uploadHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) {
        setValidationError("The photo could not be read. Please try again.");
        setPreviewImage(null);
        return;
      }
      tempCtx.fillStyle = "#FFFFFF";
      tempCtx.fillRect(0, 0, uploadWidth, uploadHeight);
      tempCtx.drawImage(imgElement, 0, 0, uploadWidth, uploadHeight);
      const imageBase64 = tempCanvas.toDataURL("image/jpeg", 0.82);

      setProcessingStage("Analyzing your skin");

      const apiResponse = await fetch("/api/skin-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: imageBase64,
          method: "photo",
          mediaPipeData: analysisReport
        }),
      });

      const apiResult = await apiResponse.json();

      if (!apiResponse.ok) {
        if (apiResult.error === "API_QUOTA_EXCEEDED") {
          setIsQuotaError(true);
          return;
        }
        if (apiResult.error === "PHOTO_ANALYSIS_UNAVAILABLE") {
          const params = new URLSearchParams();
          params.set("notice", "photo-unavailable");
          if (questionnaireSkinTypes.has(analysisReport.skinType)) {
            params.set("skinType", analysisReport.skinType);
          }
          const concerns: string[] = [];
          for (const raw of analysisReport.primaryConcerns) {
            const tag = canonicalConcern(raw);
            if (!tag || !questionnaireConcerns.has(tag) || concerns.includes(tag)) continue;
            concerns.push(tag);
            if (concerns.length === 5) break;
          }
          if (concerns.length > 0) params.set("concerns", concerns.join("|"));
          router.push(`/skin-analysis/questionnaire?${params.toString()}`);
          return;
        }
        if (apiResult.code === "FACE_NOT_CLEAR") {
          const serverMessage = typeof apiResult.error === "string" ? apiResult.error.trim() : "";
          setValidationError(
            serverMessage ||
              "Face not detected clearly. Please use a straight, well-lit, front-facing photo.",
          );
          setOfferQuestionnaire(true);
          setPreviewImage(null);
          return;
        }
        setValidationError("The photo could not be read. Please try again.");
        setPreviewImage(null);
        return;
      }

      setProcessingStage("Building your routine");
      let redirectUrl = `/skin-analysis/results/${apiResult.sessionId}`;
      
      if (apiResult.needsSkinTypeConfirmation) {
        redirectUrl += `?confirm=true&q=${encodeURIComponent(apiResult.confirmationQuestion || "Does your skin feel tight after washing?")}`;
      }
      
      router.push(redirectUrl);

    } catch {
      console.error("Scan processing failed");
      setValidationError("The photo could not be read. Please try again.");
      setPreviewImage(null);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const handleCapture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setPreviewImage(imageSrc);
        processAndValidateCapture(imageSrc);
      }
    }
  }, [webcamRef]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setPreviewImage(previewUrl);
      processAndValidateCapture(file);
    }
  };

  const resetScan = () => {
    setPreviewImage(null);
    setValidationError(null);
    setIsQuotaError(false);
    setOfferQuestionnaire(false);
  };

  if (!hasConsent) {
    return (
      <div className="ui-container min-h-screen flex items-center justify-center py-12">
        <div className="ui-card max-w-md w-full text-center">
          <div className="ui-card-header flex flex-col items-center">
            <div className="w-16 h-16 bg-[var(--rose-soft)] text-[var(--rose-primary)] rounded-full flex items-center justify-center mb-4">
              <ShieldCheck size={32} />
            </div>
            <h1 className="ui-h1">AI Skin Scan Consent</h1>
          </div>
          <div className="ui-card-body">
            <p className="ui-muted mb-6 text-base">
              Your photo is sent for analysis and is not saved on our servers. A face-analysis service and, if needed, a vision model read it only to suggest products. This is not a medical diagnosis.
            </p>
            <button 
              onClick={() => setHasConsent(true)}
              className="ui-btn w-full py-3 text-lg"
            >
              I Agree, Open Camera
            </button>
            <p className="ui-helper mt-4">For best results, remove heavy makeup and stay in a bright environment.</p>
          </div>
        </div>
      </div>
    );
  }

  // --- QUOTA EXCEEDED ERROR UI ---
  if (isQuotaError) {
    return (
      <div className="ui-container min-h-screen flex items-center justify-center py-12">
        <div className="max-w-md w-full bg-white border border-[#FEE4E2] shadow-sm rounded-2xl p-8 text-center">
          <div className="w-20 h-20 bg-[#FEF3F2] text-[#B42318] rounded-full flex items-center justify-center mx-auto mb-6">
            <ServerCrash size={40} />
          </div>
          <h2 className="text-2xl font-semibold text-[#B42318] mb-3">System Busy</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Our AI analysis servers are experiencing exceptionally high traffic right now. Please wait a few moments and try your scan again.
          </p>
          <button 
            onClick={resetScan}
            className="w-full bg-[#B42318] text-white py-3 rounded-full font-medium hover:bg-[#991B1B] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-container min-h-screen flex flex-col items-center py-8">
      <div className="w-full max-w-md flex justify-between items-center mb-6">
        <h2 className="ui-h2">Face Mesh Scanner</h2>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="ui-btn-secondary text-xs"
          disabled={isProcessing}
        >
          <Upload size={16} /> Upload Photo
        </button>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* REGULAR VALIDATION ERROR UI */}
      {validationError && !isQuotaError && (
        <div className="w-full max-w-md bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] p-4 rounded-xl flex items-start justify-between gap-3 mb-4 text-sm font-medium">
          <div className="flex items-start gap-2">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p>{validationError}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {offerQuestionnaire ? (
              <Link href="/skin-analysis/questionnaire" className="underline text-xs hover:opacity-80">
                Take the questionnaire instead
              </Link>
            ) : null}
            <button onClick={resetScan} className="underline text-xs shrink-0 hover:opacity-80">
              Try Again
            </button>
          </div>
        </div>
      )}

      <div className="ui-section relative w-full max-w-md h-[65vh] overflow-hidden rounded-2xl flex items-center justify-center bg-[#F3F4F6]">
        {previewImage ? (
          <img src={previewImage} alt="Scan preview" className="w-full h-full object-cover rounded-2xl" />
        ) : cameraError ? (
          <div className="text-center p-6">
            <p className="ui-muted mb-4">Camera access denied or unavailable.</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="ui-btn"
            >
              Upload Photo Instead
            </button>
          </div>
        ) : (
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            mirrored={true}
            onUserMediaError={() => setCameraError(true)}
            className="w-full h-full object-cover rounded-2xl"
          />
        )}

        {isProcessing && (
          <div className="absolute inset-0 ui-glass flex flex-col items-center justify-center z-10 rounded-2xl px-6 text-center">
            <div className="w-12 h-12 border-4 border-[var(--rose-soft)] border-t-[var(--rose-primary)] rounded-full animate-spin mb-4"></div>
            <p className="font-semibold text-[var(--rose-primary)] text-base mb-1">{processingStage}</p>
            <p className="ui-helper">Please wait while our AI analyzes your skin...</p>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!previewImage && !cameraError && !isProcessing && (
        <div className="w-full max-w-md mt-8 flex justify-center">
          <button 
            onClick={handleCapture}
            disabled={isProcessing}
            className="w-20 h-20 rounded-full border-4 border-[var(--rose-soft)] bg-white shadow-md active:scale-95 transition flex items-center justify-center relative group disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--rose-primary)] group-hover:bg-opacity-90 transition flex items-center justify-center text-white">
              <Camera size={28} />
            </div>
          </button>
        </div>
      )}

      {previewImage && !isProcessing && validationError && !isQuotaError && (
        <div className="w-full max-w-md mt-6 flex justify-center">
          <button onClick={resetScan} className="ui-btn-secondary gap-2">
            <RefreshCw size={16} /> Retake Photo
          </button>
        </div>
      )}
    </div>
  );
}






