// "use client";

// import { useState, useRef, useCallback } from "react";
// import Webcam from "react-webcam";
// import { supabase } from "@/src/lib/supabase/client";
// import { compressImage } from "@/src/lib/image-utils";
// import { processFaceImage, drawLandmarksOnCanvas, FaceAnalysisResult } from "@/src/lib/skin-analysis/face-mesh";
// import { analyzeSkinFromLandmarks } from "@/src/lib/skin-analysis/cv-heuristics";
// import { Camera, Upload, ShieldCheck, AlertCircle, RefreshCw, ServerCrash } from "lucide-react";
// import { useRouter } from "next/navigation";

// export default function ScanPage() {
//   const router = useRouter();
//   const webcamRef = useRef<Webcam>(null);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
  
//   const [hasConsent, setHasConsent] = useState(false);
//   const [cameraError, setCameraError] = useState(false);
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [processingStage, setProcessingStage] = useState<string>("");
//   const [previewImage, setPreviewImage] = useState<string | null>(null);
//   const [validationError, setValidationError] = useState<string | null>(null);
  
//   // NEW: State for API Quota Exceeded
//   const [isQuotaError, setIsQuotaError] = useState(false);

//   const videoConstraints = {
//     width: 1080,
//     height: 1920,
//     facingMode: "user",
//   };

//   const processAndValidateCapture = async (source: string | File) => {
//     let objectUrl: string | null = null;
//     try {
//       setIsProcessing(true);
//       setValidationError(null);
//       setIsQuotaError(false);

//       // Stage 1: Compress Image
//       setProcessingStage("Optimizing image quality...");
//       const compressedBlob = await compressImage(source);
      
//       // Stage 2: Load Image Element
//       setProcessingStage("Initializing Face Mesh AI...");
//       const imgElement = new Image();
//       objectUrl = URL.createObjectURL(compressedBlob);
//       imgElement.src = objectUrl;

//       await new Promise((resolve, reject) => {
//         imgElement.onload = resolve;
//         imgElement.onerror = reject;
//       });

//       // Stage 3: Face Detection & Validation
//       setProcessingStage("Detecting facial landmarks...");
//       const faceResult: FaceAnalysisResult = await processFaceImage(imgElement);

//       if (!faceResult.isValid || !faceResult.landmarks) {
//         setValidationError(faceResult.errorMessage || "Skin scan failed validation.");
//         setPreviewImage(null);
//         return;
//       }

//       // Render Overlay Mesh for verification (Hidden by default)
//       if (canvasRef.current) {
//         canvasRef.current.width = imgElement.width;
//         canvasRef.current.height = imgElement.height;
//         const ctx = canvasRef.current.getContext("2d");
//         ctx?.drawImage(imgElement, 0, 0);
//         drawLandmarksOnCanvas(canvasRef.current, faceResult.landmarks);
//       }

//       // Stage 4: Run CV Computer Vision Heuristics (HYBRID DATA)
//       setProcessingStage("Generating localized skin metrics...");
//       const analysisReport = analyzeSkinFromLandmarks(imgElement, faceResult.landmarks);

//       // Stage 5: Generate strictly JPEG Base64 for Face++ API
//       setProcessingStage("Preparing data for AI...");
//       const tempCanvas = document.createElement("canvas");
//       tempCanvas.width = imgElement.width;
//       tempCanvas.height = imgElement.height;
//       const tempCtx = tempCanvas.getContext("2d");
      
//       if (tempCtx) {
//         // Draw white background first (just in case of transparent pixels)
//         tempCtx.fillStyle = "#FFFFFF";
//         tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
//         tempCtx.drawImage(imgElement, 0, 0);
//       }
      
//       // Convert to strict JPEG for Face++ (Quality: 0.9)
//       const imageBase64 = tempCanvas.toDataURL("image/jpeg", 0.9);

//       // Stage 6: Upload Image to Supabase Storage
//       setProcessingStage("Uploading scan securely...");
//       const fileName = `scan_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

//       const { error: storageError } = await supabase.storage
//         .from("skin-scans")
//         .upload(fileName, compressedBlob, {
//           contentType: "image/webp",
//           upsert: false,
//         });

//       if (storageError) {
//         throw new Error(`Storage upload failed: ${storageError.message}`);
//       }

//       const { data: { publicUrl } } = supabase.storage
//         .from("skin-scans")
//         .getPublicUrl(fileName);

//       // Stage 7: Call Backend API Route (Hybrid Engine)
//       setProcessingStage("Analyzing with Hybrid AI Engine...");
      
//       const apiResponse = await fetch("/api/skin-analysis", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           imageBase64: imageBase64,
//           imageUrl: publicUrl,
//           method: "photo",
//           mediaPipeData: analysisReport // <-- Sending Hybrid Data for Groq Fallback
//         }),
//       });

//       const apiResult = await apiResponse.json();

//       if (!apiResponse.ok) {
//         if (apiResult.error === "API_QUOTA_EXCEEDED") {
//           setIsQuotaError(true);
//           throw new Error(apiResult.message);
//         }
//         throw new Error(apiResult.error || apiResult.details || "API Analysis failed");
//       }

//       // Stage 8: Redirect to Analysis Result Page
//       setProcessingStage("Finalizing your personalized report...");
//       router.push(`/skin-analysis/results/${apiResult.sessionId}`);

//     } catch (error: any) {
//       console.error("Scan Processing Error:", error);
//       if (!isQuotaError) {
//         setValidationError(error.message || "Failed to complete skin analysis. Please try again.");
//       }
//       setPreviewImage(null);
//     } finally {
//       if (objectUrl) {
//         URL.revokeObjectURL(objectUrl);
//       }
//       setIsProcessing(false);
//       setProcessingStage("");
//     }
//   };

//   const handleCapture = useCallback(() => {
//     if (webcamRef.current) {
//       const imageSrc = webcamRef.current.getScreenshot();
//       if (imageSrc) {
//         setPreviewImage(imageSrc);
//         processAndValidateCapture(imageSrc);
//       }
//     }
//   }, [webcamRef]);

//   const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (file) {
//       const previewUrl = URL.createObjectURL(file);
//       setPreviewImage(previewUrl);
//       processAndValidateCapture(file);
//     }
//   };

//   const resetScan = () => {
//     setPreviewImage(null);
//     setValidationError(null);
//     setIsQuotaError(false);
//   };

//   if (!hasConsent) {
//     return (
//       <div className="ui-container min-h-screen flex items-center justify-center py-12">
//         <div className="ui-card max-w-md w-full text-center">
//           <div className="ui-card-header flex flex-col items-center">
//             <div className="w-16 h-16 bg-[var(--rose-soft)] text-[var(--rose-primary)] rounded-full flex items-center justify-center mb-4">
//               <ShieldCheck size={32} />
//             </div>
//             <h1 className="ui-h1">AI Skin Scan Consent</h1>
//           </div>
//           <div className="ui-card-body">
//             <p className="ui-muted mb-6 text-base">
//               Our system uses AI to map your facial regions for localized skin analysis. Photos are processed securely to recommend the best products for your unique skin type.
//             </p>
//             <button 
//               onClick={() => setHasConsent(true)}
//               className="ui-btn w-full py-3 text-lg"
//             >
//               I Agree, Open Camera
//             </button>
//             <p className="ui-helper mt-4">For best results, remove heavy makeup and stay in a bright environment.</p>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   // --- QUOTA EXCEEDED ERROR UI ---
//   if (isQuotaError) {
//     return (
//       <div className="ui-container min-h-screen flex items-center justify-center py-12">
//         <div className="max-w-md w-full bg-white border border-[#FEE4E2] shadow-sm rounded-2xl p-8 text-center">
//           <div className="w-20 h-20 bg-[#FEF3F2] text-[#B42318] rounded-full flex items-center justify-center mx-auto mb-6">
//             <ServerCrash size={40} />
//           </div>
//           <h2 className="text-2xl font-semibold text-[#B42318] mb-3">System Busy</h2>
//           <p className="text-gray-600 mb-8 leading-relaxed">
//             Our AI analysis servers are experiencing exceptionally high traffic right now. Please wait a few moments and try your scan again.
//           </p>
//           <button 
//             onClick={resetScan}
//             className="w-full bg-[#B42318] text-white py-3 rounded-full font-medium hover:bg-[#991B1B] transition-colors"
//           >
//             Try Again
//           </button>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="ui-container min-h-screen flex flex-col items-center py-8">
//       <div className="w-full max-w-md flex justify-between items-center mb-6">
//         <h2 className="ui-h2">Face Mesh Scanner</h2>
//         <button 
//           onClick={() => fileInputRef.current?.click()}
//           className="ui-btn-secondary text-xs"
//           disabled={isProcessing}
//         >
//           <Upload size={16} /> Upload Photo
//         </button>
//       </div>

//       <input 
//         type="file" 
//         ref={fileInputRef} 
//         onChange={handleFileUpload} 
//         accept="image/*" 
//         className="hidden" 
//       />

//       {/* REGULAR VALIDATION ERROR UI */}
//       {validationError && !isQuotaError && (
//         <div className="w-full max-w-md bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] p-4 rounded-xl flex items-start justify-between gap-3 mb-4 text-sm font-medium">
//           <div className="flex items-start gap-2">
//             <AlertCircle size={20} className="shrink-0 mt-0.5" />
//             <p>{validationError}</p>
//           </div>
//           <button onClick={resetScan} className="underline text-xs shrink-0 hover:opacity-80">
//             Try Again
//           </button>
//         </div>
//       )}

//       <div className="ui-section relative w-full max-w-md h-[65vh] overflow-hidden rounded-2xl flex items-center justify-center bg-[#F3F4F6]">
//         {previewImage ? (
//           <img src={previewImage} alt="Scan preview" className="w-full h-full object-cover rounded-2xl" />
//         ) : cameraError ? (
//           <div className="text-center p-6">
//             <p className="ui-muted mb-4">Camera access denied or unavailable.</p>
//             <button 
//               onClick={() => fileInputRef.current?.click()}
//               className="ui-btn"
//             >
//               Upload Photo Instead
//             </button>
//           </div>
//         ) : (
//           <Webcam
//             audio={false}
//             ref={webcamRef}
//             screenshotFormat="image/jpeg"
//             videoConstraints={videoConstraints}
//             mirrored={true}
//             onUserMediaError={() => setCameraError(true)}
//             className="w-full h-full object-cover rounded-2xl"
//           />
//         )}

//         {isProcessing && (
//           <div className="absolute inset-0 ui-glass flex flex-col items-center justify-center z-10 rounded-2xl px-6 text-center">
//             <div className="w-12 h-12 border-4 border-[var(--rose-soft)] border-t-[var(--rose-primary)] rounded-full animate-spin mb-4"></div>
//             <p className="font-semibold text-[var(--rose-primary)] text-base mb-1">{processingStage}</p>
//             <p className="ui-helper">Please wait while our AI analyzes your skin...</p>
//           </div>
//         )}

//         <canvas ref={canvasRef} className="hidden" />
//       </div>

//       {!previewImage && !cameraError && !isProcessing && (
//         <div className="w-full max-w-md mt-8 flex justify-center">
//           <button 
//             onClick={handleCapture}
//             disabled={isProcessing}
//             className="w-20 h-20 rounded-full border-4 border-[var(--rose-soft)] bg-white shadow-md active:scale-95 transition flex items-center justify-center relative group disabled:opacity-50"
//           >
//             <div className="w-16 h-16 rounded-full bg-[var(--rose-primary)] group-hover:bg-opacity-90 transition flex items-center justify-center text-white">
//               <Camera size={28} />
//             </div>
//           </button>
//         </div>
//       )}

//       {previewImage && !isProcessing && validationError && !isQuotaError && (
//         <div className="w-full max-w-md mt-6 flex justify-center">
//           <button onClick={resetScan} className="ui-btn-secondary gap-2">
//             <RefreshCw size={16} /> Retake Photo
//           </button>
//         </div>
//       )}
//     </div>
//   );
// }


"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { supabase } from "@/src/lib/supabase/client";
import { compressImage } from "@/src/lib/image-utils";
import { processFaceImage, drawLandmarksOnCanvas, FaceAnalysisResult } from "@/src/lib/skin-analysis/face-mesh";
import { analyzeSkinFromLandmarks } from "@/src/lib/skin-analysis/cv-heuristics";
import { Camera, Upload, ShieldCheck, AlertCircle, RefreshCw, ServerCrash, FileText } from "lucide-react";
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
  const [unavailableError, setUnavailableError] = useState<{ message: string } | null>(null);

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
      setUnavailableError(null);

      // Stage 1: Compress Image
      setProcessingStage("Optimizing image quality...");
      const compressedBlob = await compressImage(source);
      
      // Stage 2: Load Image Element
      setProcessingStage("Initializing Face Mesh AI...");
      const imgElement = new Image();
      objectUrl = URL.createObjectURL(compressedBlob);
      imgElement.src = objectUrl;

      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });

      // Stage 3: Face Detection & Validation
      setProcessingStage("Detecting facial landmarks...");
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

      // Stage 4: Run CV Computer Vision Heuristics
      setProcessingStage("Generating localized skin metrics...");
      const analysisReport = analyzeSkinFromLandmarks(imgElement, faceResult.landmarks);

      // Stage 5: Generate strictly JPEG Base64 for API
      setProcessingStage("Preparing data for AI...");
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imgElement.width;
      tempCanvas.height = imgElement.height;
      const tempCtx = tempCanvas.getContext("2d");
      
      if (tempCtx) {
        tempCtx.fillStyle = "#FFFFFF";
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(imgElement, 0, 0);
      }
      
      const imageBase64 = tempCanvas.toDataURL("image/jpeg", 0.9);

      // Stage 6: Upload Image to Supabase Storage
      setProcessingStage("Uploading scan securely...");
      const fileName = `scan_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

      const { error: storageError } = await supabase.storage
        .from("skin-scans")
        .upload(fileName, compressedBlob, {
          contentType: "image/webp",
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from("skin-scans")
        .getPublicUrl(fileName);

      // Stage 7: Call Backend API Route
      setProcessingStage("Analyzing with Hybrid AI Engine...");
      
      const apiResponse = await fetch("/api/skin-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: imageBase64,
          imageUrl: publicUrl,
          method: "photo",
          mediaPipeData: analysisReport
        }),
      });

      const apiResult = await apiResponse.json();

      if (!apiResponse.ok) {
        if (apiResult.error === "API_QUOTA_EXCEEDED") {
          setIsQuotaError(true);
          throw new Error(apiResult.message);
        }
        if (apiResult.error === "PHOTO_ANALYSIS_UNAVAILABLE") {
          setUnavailableError({ message: apiResult.message });
          throw new Error(apiResult.message);
        }
        throw new Error(apiResult.error || apiResult.details || "API Analysis failed");
      }

      // Stage 8: Redirect to Analysis Result Page
      setProcessingStage("Finalizing your personalized report...");
      let redirectUrl = `/skin-analysis/results/${apiResult.sessionId}`;
      
      if (apiResult.needsSkinTypeConfirmation) {
        redirectUrl += `?confirm=true&q=${encodeURIComponent(apiResult.confirmationQuestion || "Does your skin feel tight after washing?")}`;
      }
      
      router.push(redirectUrl);

    } catch (error: any) {
      console.error("Scan Processing Error:", error);
      if (!isQuotaError && !unavailableError) {
        setValidationError(error.message || "Failed to complete skin analysis. Please try again.");
      }
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
    setUnavailableError(null);
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
              Our system uses AI to map your facial regions for localized skin analysis. Photos are processed securely to recommend the best products for your unique skin type.
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

  // --- PHOTO ANALYSIS UNAVAILABLE FALLBACK UI ---
  if (unavailableError) {
    return (
      <div className="ui-container min-h-screen flex items-center justify-center py-12">
        <div className="max-w-md w-full bg-white border border-[#FEE4E2] shadow-sm rounded-2xl p-8 text-center">
          <div className="w-20 h-20 bg-[#FEF3F2] text-[#B42318] rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} />
          </div>
          <h2 className="text-2xl font-semibold text-[#B42318] mb-3">Photo Scan Unavailable</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            {unavailableError.message}
          </p>
          <div className="flex flex-col gap-3">
            <Link 
              href="/skin-analysis/questionnaire"
              className="w-full bg-[#B42318] text-white py-3 rounded-full font-medium hover:bg-[#991B1B] transition-colors flex items-center justify-center gap-2"
            >
              <FileText size={18} /> Take Quick Questionnaire Instead
            </Link>
            <button 
              onClick={resetScan}
              className="ui-btn-secondary w-full py-3"
            >
              Try Photo Scan Again
            </button>
          </div>
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
      {validationError && !isQuotaError && !unavailableError && (
        <div className="w-full max-w-md bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] p-4 rounded-xl flex items-start justify-between gap-3 mb-4 text-sm font-medium">
          <div className="flex items-start gap-2">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p>{validationError}</p>
          </div>
          <button onClick={resetScan} className="underline text-xs shrink-0 hover:opacity-80">
            Try Again
          </button>
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

      {previewImage && !isProcessing && validationError && !isQuotaError && !unavailableError && (
        <div className="w-full max-w-md mt-6 flex justify-center">
          <button onClick={resetScan} className="ui-btn-secondary gap-2">
            <RefreshCw size={16} /> Retake Photo
          </button>
        </div>
      )}
    </div>
  );
}






