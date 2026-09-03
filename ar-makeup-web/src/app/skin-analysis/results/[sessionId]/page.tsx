





// "use client";

// import { useEffect, useState, use } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { createClient } from "@supabase/supabase-js";
// import {
//   Sun,
//   Moon,
//   Sparkles,
//   CheckCircle2,
//   ChevronLeft,
//   ShoppingBag,
//   ShoppingCart,
//   X,
//   Camera,
//   FileText,
//   Activity,
//   ShieldAlert,
//   Droplets,
//   Award,
//   Layers,
// } from "lucide-react";
// import Link from "next/link";
// import { addToCart } from "@/src/store/cart";

// const supabase = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
// );

// // ─── 1. FRONTEND UI MAPPING DICTIONARY ────────────────────────────────────────
// // Jo tags is mapping mein nahi honge (jaise 'soothing', 'hydration', 'water-based') 
// // wo auto-hide ho jayenge aur user ko badges mein nahi dikhenge!
// const UI_CONCERNS_MAPPING: Record<string, string> = {
//   "anti-aging": "Wrinkles & Fine Lines",
//   "Anti-Aging": "Wrinkles & Fine Lines",
//   "acne": "Acne & Breakouts",
//   "Acne Prone": "Acne & Breakouts",
//   "redness": "Redness & Sensitivity",
//   "Redness & Soothing": "Redness & Sensitivity",
//   "irritation": "Redness & Sensitivity",
//   "dark spots": "Dark Spots & Pigmentation",
//   "Dark Spots & Brightening": "Dark Spots & Pigmentation",
//   "hyperpigmentation": "Dark Spots & Pigmentation",
//   "dullness": "Dull Skin",
//   "dryness": "Dryness & Dehydration",
//   "dehydration": "Dryness & Dehydration",
//   "Exfoliating / Texture": "Uneven Texture",
//   "rosacea": "Rosacea",
//   "damaged barrier": "Damaged Barrier",
//   "sun-damage": "Sun Damage",
// };

// // Super Robust Score Parser
// const parseScore = (val: any): number => {
//   if (val === null || val === undefined) return 0;

//   if (typeof val === "number" && !isNaN(val)) {
//     return val <= 1 && val > 0 ? val * 100 : val;
//   }

//   if (typeof val === "string") {
//     const parsed = parseFloat(val.replace(/[^0-9.]/g, ""));
//     if (!isNaN(parsed)) {
//       return parsed <= 1 && parsed > 0 ? parsed * 100 : parsed;
//     }
//     return 0;
//   }

//   if (Array.isArray(val)) {
//     const validNums = val.map((v) => parseScore(v)).filter((v) => v > 0);
//     if (validNums.length === 0) return 0;
//     return validNums.reduce((a, b) => a + b, 0) / validNums.length;
//   }

//   if (typeof val === "object") {
//     const keysToCheck = [
//       "score",
//       "healthScore",
//       "health",
//       "val",
//       "value",
//       "percent",
//       "percentage",
//       "rating",
//     ];
//     for (const key of keysToCheck) {
//       if (val[key] !== undefined) {
//         const res = parseScore(val[key]);
//         if (res > 0) return res;
//       }
//     }

//     for (const nestedVal of Object.values(val)) {
//       const res = parseScore(nestedVal);
//       if (res > 0) return res;
//     }
//   }

//   return 0;
// };

// // Clean region label formatter
// const formatRegionName = (name: string) => {
//   const clean = name
//     .replace(/zone/gi, "")
//     .replace(/([A-Z])/g, " $1")
//     .trim();
//   return (clean.charAt(0).toUpperCase() + clean.slice(1)).trim() + " Zone";
// };

// export default function ResultsPage({
//   params,
// }: {
//   params: Promise<{ sessionId: string }>;
// }) {
//   const resolvedParams = use(params);
//   const sessionId = resolvedParams.sessionId;

//   const [logData, setLogData] = useState<any>(null);
//   const [loading, setLoading] = useState(true);
//   const [isGeneratingRoutine, setIsGeneratingRoutine] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [activeTab, setActiveTab] = useState<"AM" | "PM">("AM");

//   // Cart & Modal States
//   const [addingId, setAddingId] = useState<string | null>(null);
//   const [addingFull, setAddingFull] = useState(false);
//   const [selectedItem, setSelectedItem] = useState<any | null>(null);

//   useEffect(() => {
//     async function fetchResultsAndProcess() {
//       try {
//         setLoading(true);
//         const { data, error: fetchErr } = await supabase
//           .from("skin_analysis_logs")
//           .select("*")
//           .eq("id", sessionId)
//           .single();

//         if (fetchErr) throw fetchErr;

//         setLogData(data);

//         if (
//           data &&
//           (!data.routine_snapshot || !data.routine_snapshot.amRoutine)
//         ) {
//           await generateRoutineOnTheFly(data);
//         }
//       } catch (err: any) {
//         console.error("Fetch Error:", err);
//         setError("Could not load your skin analysis report. Please try again.");
//       } finally {
//         setLoading(false);
//       }
//     }

//     if (sessionId) fetchResultsAndProcess();
//   }, [sessionId]);

//   const generateRoutineOnTheFly = async (record: any) => {
//     try {
//       setIsGeneratingRoutine(true);

//       let concernsForApi: Record<string, number> = {};

//       if (record.method === "photo" && record.concern_scores) {
//         const scores = record.concern_scores.scores || {};
//         const concernsList = record.concern_scores.concerns_list || [];

//         concernsList.forEach((c: string) => {
//           concernsForApi[c] = 8;
//         });

//         Object.entries(scores).forEach(([k, v]) => {
//           concernsForApi[k] = Number(v);
//         });
//       } else if (record.concern_scores) {
//         concernsForApi = record.concern_scores;
//       }

//       const response = await fetch("/api/generate-routine", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           analysisId: record.id,
//           userSkinType: record.skin_type || "Combination",
//           concernScores: concernsForApi,
//         }),
//       });
//       if (!response.ok) throw new Error("Failed to generate AI routine");

//       const resData = await response.json();

//       setLogData((prev: any) => ({
//         ...prev,
//         routine_snapshot: {
//           amRoutine: resData.data.amRoutine,
//           pmRoutine: resData.data.pmRoutine,
//         },
//         ai_summary: resData.data.summary,
//       }));
//     } catch (apiErr) {
//       console.error("Failed to generate routine dynamically:", apiErr);
//     } finally {
//       setIsGeneratingRoutine(false);
//     }
//   };

//   // --- CART HANDLERS ---
//   const handleAddToCart = (product: any, e?: React.MouseEvent) => {
//     if (e) e.stopPropagation();
//     const targetKey = product.product_key || product.id;
//     setAddingId(targetKey);

//     addToCart({
//       product_key: targetKey,
//       shade_key: "no-shade",
//       shade_name: "Standard",
//       quantity: 1,
//       name: product.name,
//       brand: product.brand,
//       price: product.price || 0,
//       image_url: product.image_url,
//     });

//     setTimeout(() => setAddingId(null), 1200);
//   };

//   const handleAddRoutineToCart = (routineArray: any[]) => {
//     setAddingFull(true);
//     routineArray.forEach((item) => {
//       const product = item.product || item;
//       addToCart({
//         product_key: product.product_key || product.id,
//         shade_key: "no-shade",
//         shade_name: "Standard",
//         quantity: 1,
//         name: product.name,
//         brand: product.brand,
//         price: product.price || 0,
//         image_url: product.image_url,
//       });
//     });
//     setTimeout(() => setAddingFull(false), 1500);
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] gap-4">
//         <Sparkles className="w-10 h-10 animate-spin text-[var(--rose-primary)]" />
//         <p className="text-[var(--text-secondary)] font-medium text-sm animate-pulse">
//           Analyzing your skin diagnostics and compiling personalized routine...
//         </p>
//       </div>
//     );
//   }

//   if (error || !logData) {
//     return (
//       <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] p-4 text-center">
//         <ShieldAlert className="w-12 h-12 text-red-500 mb-3" />
//         <h2 className="text-xl font-bold text-gray-900 mb-2">
//           Report Generation Failed
//         </h2>
//         <p className="text-gray-600 mb-6 max-w-md">
//           {error || "Could not retrieve skin profile."}
//         </p>
//         <Link href="/skin-analysis/scan" className="ui-btn">
//           Start New Analysis
//         </Link>
//       </div>
//     );
//   }

//   // --- DATA PARSING ---
//   const isPhotoMethod = logData.method === "photo";
//   const userSkinType = logData.skin_type || "Combination";

//   let detectedConcerns: string[] = [];
//   let overallScore: number | null = null;
//   let regionBreakdown: Record<string, any> | null = null;

//   if (logData.concern_scores) {
//     detectedConcerns =
//       logData.concern_scores.main_concerns ||
//       logData.concern_scores.concerns_list ||
//       Object.entries(logData.concern_scores)
//         .filter(([k, score]) => k !== "main_concerns" && Number(score) > 0)
//         .map(([concern]) => concern);
//   }

//   // ─── 2. CLEAN DISPLAY CONCERNS FOR USER INTERFACE ──────────────────────────
//   // Backend ke saare 10-15 tags mein se sirf user-friendly names extract ho kar yahan aayenge:
//   const displayConcerns = Array.from(
//     new Set(
//       detectedConcerns
//         .map((tag) => UI_CONCERNS_MAPPING[tag])
//         .filter((name): name is string => Boolean(name))
//     )
//   );

//   if (isPhotoMethod && logData.routine_snapshot) {
//     overallScore = logData.routine_snapshot.overallSkinScore || null;
//     regionBreakdown = logData.routine_snapshot.regionalHealthScores || null;
//   }

//   // Routine Parsing
//   let am = [],
//     pm = [];
//   if (logData?.routine_snapshot) {
//     am =
//       logData.routine_snapshot.amRoutine ||
//       logData.routine_snapshot.am_routine ||
//       logData.routine_snapshot.AM ||
//       [];
//     pm =
//       logData.routine_snapshot.pmRoutine ||
//       logData.routine_snapshot.pm_routine ||
//       logData.routine_snapshot.PM ||
//       [];
//   }

//   const routines = { AM: am, PM: pm };
//   const currentRoutine = routines[activeTab];

//   return (
//     <div className="min-h-screen bg-[var(--bg-base)] py-12 px-4 sm:px-6 lg:px-8 relative">
//       <div className="mx-auto w-full max-w-5xl">
//         {/* TOP BAR / NAVIGATION */}
//         <div className="flex items-center justify-between mb-8">
//           <Link
//             href={
//               isPhotoMethod
//                 ? "/skin-analysis/scan"
//                 : "/skin-analysis/questionnaire"
//             }
//             className="inline-flex items-center text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--rose-primary)] transition"
//           >
//             <ChevronLeft className="w-4 h-4 mr-1" /> Retake Analysis
//           </Link>
//           <div className="flex items-center gap-2">
//             <span className="ui-badge bg-white shadow-sm border border-[var(--border-soft)] text-xs flex items-center gap-1.5">
//               {isPhotoMethod ? (
//                 <Camera className="w-3.5 h-3.5 text-[var(--rose-primary)]" />
//               ) : (
//                 <FileText className="w-3.5 h-3.5 text-[var(--rose-primary)]" />
//               )}
//               {isPhotoMethod ? "Face Mesh AI Scan" : "Questionnaire Analysis"}
//             </span>
//           </div>
//         </div>

//         {/* HERO DIAGNOSTIC PROFILE CARD */}
//         <motion.div
//           initial={{ opacity: 0, y: -15 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="ui-card p-6 md:p-8 mb-8 bg-white shadow-sm rounded-3xl border border-[var(--border-soft)] overflow-hidden relative"
//         >
//           <div className="flex flex-col md:flex-row gap-8 items-center">
//             {/* Scanned Image Preview */}
//             {isPhotoMethod && logData.image_url ? (
//               <div className="relative shrink-0">
//                 <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden border-2 border-[var(--rose-primary)]/30 shadow-md">
//                   <img
//                     src={logData.image_url}
//                     alt="Facial Scan Analysis"
//                     className="w-full h-full object-cover"
//                   />
//                 </div>
//                 {overallScore && (
//                   <div className="absolute -bottom-3 -right-3 bg-white px-3 py-1 rounded-full border-2 border-[var(--rose-primary)] shadow-md flex items-center gap-1">
//                     <Award className="w-4 h-4 text-[var(--rose-primary)]" />
//                     <span className="text-xs font-bold text-[var(--text-main)]">
//                       {overallScore}/100
//                     </span>
//                   </div>
//                 )}
//               </div>
//             ) : (
//               <div className="w-28 h-28 rounded-2xl bg-[var(--rose-soft)]/40 flex items-center justify-center shrink-0 border border-[var(--rose-primary)]/20">
//                 <Droplets className="w-12 h-12 text-[var(--rose-primary)]" />
//               </div>
//             )}

//             {/* Diagnostics Summary */}
//             <div className="flex-1 text-center md:text-left">
//               <span className="ui-badge mb-2 inline-block">
//                 AI Diagnostic Report
//               </span>
//               <h1 className="ui-h1 text-2xl md:text-3xl mb-3">
//                 Skin Profile Assessment
//               </h1>

//               {/* CLEAN BADGES RENDERING */}
//               <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
//                 <div className="bg-[var(--rose-soft)]/50 text-[var(--rose-primary)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--rose-primary)]/20">
//                   Type: <span className="capitalize">{userSkinType}</span>
//                 </div>

//                 {displayConcerns.length > 0 ? (
//                   displayConcerns.map((concern, idx) => (
//                     <span
//                       key={idx}
//                       className="bg-gray-100 text-gray-700 font-medium text-xs px-3 py-1.5 rounded-lg border border-gray-200"
//                     >
//                       {concern}
//                     </span>
//                   ))
//                 ) : (
//                   <span className="text-xs text-gray-500 italic">
//                     Overall Skin Maintenance
//                   </span>
//                 )}
//               </div>

//               <p className="ui-muted text-sm leading-relaxed max-w-2xl">
//                 {logData.ai_summary ||
//                   `Our AI Dermatologist matched products specifically formulated to balance your ${userSkinType.toLowerCase()} skin and address ${
//                     displayConcerns.join(", ") || "daily maintenance"
//                   }.`}
//               </p>
//             </div>
//           </div>

//           {/* FACIAL REGION BREAKDOWN */}
//           {isPhotoMethod && regionBreakdown && (
//             <div className="mt-6 pt-6 border-t border-[var(--border-soft)]">
//               <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
//                 <Activity className="w-4 h-4 text-[var(--rose-primary)]" />{" "}
//                 Regional Health Index
//               </h4>
//               <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
//                 {Object.entries(regionBreakdown).map(([region, scoreRaw]) => {
//                   const scoreValue = parseScore(scoreRaw);
//                   return (
//                     <div
//                       key={region}
//                       className="bg-gray-50 p-3 rounded-xl border border-[var(--border-soft)] text-center"
//                     >
//                       <span className="text-[11px] font-semibold capitalize text-gray-500 block mb-1">
//                         {formatRegionName(region)}
//                       </span>
//                       <span className="text-base font-bold text-[var(--text-main)]">
//                         {Math.round(scoreValue)}%
//                       </span>
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>
//           )}
//         </motion.div>

//         {/* TABS SWITCHER */}
//         <div className="flex justify-center mb-8">
//           <div className="bg-white p-1 rounded-full border border-[var(--border-soft)] shadow-sm inline-flex">
//             <button
//               onClick={() => setActiveTab("AM")}
//               className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
//                 activeTab === "AM"
//                   ? "bg-[var(--rose-primary)] text-white shadow-md"
//                   : "text-[var(--text-muted)] hover:text-[var(--rose-primary)]"
//               }`}
//             >
//               <Sun className="w-4 h-4" /> Morning Routine
//             </button>
//             <button
//               onClick={() => setActiveTab("PM")}
//               className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
//                 activeTab === "PM"
//                   ? "bg-slate-800 text-white shadow-md"
//                   : "text-[var(--text-muted)] hover:text-slate-800"
//               }`}
//             >
//               <Moon className="w-4 h-4" /> Night Routine
//             </button>
//           </div>
//         </div>

//         {/* BUNDLE ADD TO CART */}
//         {currentRoutine.length > 0 && (
//           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-5 rounded-2xl border border-[var(--border-soft)] shadow-sm">
//             <div>
//               <h3 className="ui-h2 text-base">
//                 Complete {activeTab === "AM" ? "Morning" : "Night"} Regimen
//               </h3>
//               <p className="ui-muted text-xs mt-0.5">
//                 {currentRoutine.length} clinical-grade products target-matched
//                 for your profile
//               </p>
//             </div>
//             <button
//               onClick={() => handleAddRoutineToCart(currentRoutine)}
//               disabled={addingFull}
//               className="ui-btn w-full sm:w-auto shrink-0 justify-center"
//             >
//               {addingFull ? (
//                 <>
//                   <CheckCircle2 className="w-4 h-4" /> Added Regimen to Cart
//                 </>
//               ) : (
//                 <>
//                   <ShoppingBag className="w-4 h-4" /> Add Complete Routine
//                 </>
//               )}
//             </button>
//           </div>
//         )}

//         {/* LOADING STATE FOR ON-THE-FLY ROUTINE */}
//         {isGeneratingRoutine && (
//           <div className="bg-white p-12 rounded-3xl text-center border border-[var(--border-soft)] shadow-sm">
//             <Sparkles className="w-8 h-8 text-[var(--rose-primary)] animate-spin mx-auto mb-3" />
//             <h3 className="font-bold text-gray-800 text-base mb-1">
//               Building Routine Steps...
//             </h3>
//             <p className="text-xs text-gray-500">
//               Matching products against catalog ingredients and skin profile.
//             </p>
//           </div>
//         )}

//         {/* ROUTINE CARDS GRID */}
//         {!isGeneratingRoutine && (
//           <motion.div
//             key={activeTab}
//             initial={{ opacity: 0, y: 15 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.3 }}
//             className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
//           >
//             {currentRoutine.map((item: any, index: number) => {
//               const product = item.product || item;
//               const isAdding = addingId === (product.product_key || product.id);

//               return (
//                 <div
//                   key={index}
//                   onClick={() => setSelectedItem(item)}
//                   className="ui-card relative overflow-hidden flex flex-col group hover:shadow-lg hover:border-[var(--rose-primary)]/50 transition-all cursor-pointer bg-white"
//                 >
//                   {/* Match Score Badge */}
//                   <div className="absolute top-3 right-3 z-10">
//                     <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-[var(--rose-primary)]">
//                       <span className="text-[var(--rose-primary)] font-bold text-xs">
//                         {Math.round(item.matchScore || 92)}%
//                       </span>
//                     </div>
//                   </div>

//                   {/* Product Image */}
//                   <div className="h-48 bg-gray-50 flex items-center justify-center border-b border-[var(--border-soft)] p-4 relative">
//                     {product.image_url ? (
//                       <img
//                         src={product.image_url}
//                         alt={product.name}
//                         className="max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500"
//                       />
//                     ) : (
//                       <Sparkles className="w-8 h-8 text-gray-300" />
//                     )}

//                     <span className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm text-[var(--text-secondary)] text-[10px] font-bold uppercase px-2.5 py-1 rounded-md shadow-sm border border-[var(--border-soft)]">
//                       Step {index + 1} • {product.category || "Care"}
//                     </span>
//                   </div>

//                   {/* Card Info */}
//                   <div className="p-5 flex flex-col flex-1">
//                     <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase mb-1">
//                       {product.brand}
//                     </p>
//                     <h3 className="ui-h2 text-base leading-tight mb-3 group-hover:text-[var(--rose-primary)] transition-colors line-clamp-2">
//                       {product.name}
//                     </h3>

//                     {/* AI Reason Preview */}
//                     {item.matchReason && (
//                       <p className="text-xs text-gray-500 line-clamp-2 italic mb-4 bg-gray-50 p-2 rounded-lg border border-gray-100">
//                         "{item.matchReason}"
//                       </p>
//                     )}

//                     {/* Price & Action */}
//                     <div className="mt-auto pt-4 border-t border-[var(--border-soft)] flex items-center justify-between">
//                       <span className="text-lg font-bold text-[var(--text-main)]">
//                         ${product.price || "0.00"}
//                       </span>
//                       <button
//                         onClick={(e) => handleAddToCart(product, e)}
//                         disabled={isAdding}
//                         className={`p-2.5 rounded-xl transition-all ${
//                           isAdding
//                             ? "bg-[var(--rose-primary)] text-white"
//                             : "bg-[var(--bg-base)] hover:bg-[var(--rose-primary)]/10 text-[var(--rose-primary)] border border-[var(--rose-primary)]/20"
//                         }`}
//                       >
//                         {isAdding ? (
//                           <CheckCircle2 className="w-5 h-5" />
//                         ) : (
//                           <ShoppingCart className="w-5 h-5" />
//                         )}
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </motion.div>
//         )}

//         {/* EMPTY ROUTINE FALLBACK */}
//         {!isGeneratingRoutine && currentRoutine.length === 0 && (
//           <div className="text-center py-16 bg-white rounded-3xl border border-[var(--border-soft)]">
//             <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
//             <h3 className="text-lg font-bold text-gray-700">
//               No {activeTab} steps found
//             </h3>
//             <p className="text-sm text-gray-500 mt-1">
//               Switch to the other routine tab or re-run the scan.
//             </p>
//           </div>
//         )}
//       </div>

//       {/* --- QUICK VIEW DETAIL MODAL --- */}
//       <AnimatePresence>
//         {selectedItem && (
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
//             onClick={() => setSelectedItem(null)}
//           >
//             <motion.div
//               initial={{ scale: 0.95, opacity: 0 }}
//               animate={{ scale: 1, opacity: 1 }}
//               exit={{ scale: 0.95, opacity: 0 }}
//               onClick={(e) => e.stopPropagation()}
//               className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden relative flex flex-col md:flex-row max-h-[90vh]"
//             >
//               <button
//                 onClick={() => setSelectedItem(null)}
//                 className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition"
//               >
//                 <X className="w-5 h-5 text-gray-500" />
//               </button>

//               {/* Modal Image */}
//               <div className="md:w-2/5 bg-gray-50 p-8 flex items-center justify-center border-r border-[var(--border-soft)]">
//                 {selectedItem.product?.image_url || selectedItem.image_url ? (
//                   <img
//                     src={
//                       selectedItem.product?.image_url || selectedItem.image_url
//                     }
//                     alt="Product detail"
//                     className="max-h-64 object-contain mix-blend-multiply"
//                   />
//                 ) : (
//                   <Sparkles className="w-16 h-16 text-gray-300" />
//                 )}
//               </div>

//               {/* Modal Details */}
//               <div className="md:w-3/5 p-8 flex flex-col overflow-y-auto">
//                 <div className="flex items-center gap-2 mb-2">
//                   <span className="ui-badge bg-[var(--rose-primary)]/10 text-[var(--rose-primary)] border-none">
//                     {Math.round(selectedItem.matchScore || 92)}% Match
//                   </span>
//                   <span className="ui-badge bg-emerald-50 text-emerald-700 border-none">
//                     Skin Friendly
//                   </span>
//                 </div>

//                 <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-1">
//                   {selectedItem.product?.brand || selectedItem.brand}
//                 </p>
//                 <h2 className="text-xl font-bold text-[var(--text-main)] mb-4">
//                   {selectedItem.product?.name || selectedItem.name}
//                 </h2>

//                 {/* AI Rationale Box */}
//                 <div className="bg-[var(--rose-soft)]/20 border border-[var(--rose-soft)]/50 rounded-xl p-4 flex gap-3 mb-6">
//                   <Sparkles className="w-5 h-5 text-[var(--rose-primary)] shrink-0 mt-0.5" />
//                   <div>
//                     <h4 className="text-xs font-bold text-[var(--rose-primary)] mb-1 uppercase tracking-wider">
//                       Dermatologist AI Recommendation:
//                     </h4>
//                     <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
//                       "
//                       {selectedItem.matchReason ||
//                         "Formulated to complement your specific skin profile and concerns without causing irritation."}
//                       "
//                     </p>
//                   </div>
//                 </div>

//                 <div className="mt-auto pt-6 flex items-center justify-between border-t border-[var(--border-soft)]">
//                   <span className="text-2xl font-bold text-[var(--text-main)]">
//                     $
//                     {selectedItem.product?.price ||
//                       selectedItem.price ||
//                       "0.00"}
//                   </span>
//                   <button
//                     onClick={() => {
//                       handleAddToCart(selectedItem.product || selectedItem);
//                       setSelectedItem(null);
//                     }}
//                     className="ui-btn shadow-md hover:shadow-lg transition-all"
//                   >
//                     Add to Cart
//                   </button>
//                 </div>
//               </div>
//             </motion.div>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }





"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import {
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  ChevronLeft,
  ShoppingBag,
  ShoppingCart,
  X,
  Camera,
  FileText,
  Activity,
  ShieldAlert,
  Droplets,
  Award,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { addToCart } from "@/src/store/cart";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── 1. FRONTEND UI MAPPING DICTIONARY ────────────────────────────────────────
const UI_CONCERNS_MAPPING: Record<string, string> = {
  "anti-aging": "Wrinkles & Fine Lines",
  "Anti-Aging": "Wrinkles & Fine Lines",
  "acne": "Acne & Breakouts",
  "Acne Prone": "Acne & Breakouts",
  "redness": "Redness & Sensitivity",
  "Redness & Soothing": "Redness & Sensitivity",
  "irritation": "Redness & Sensitivity",
  "dark spots": "Dark Spots & Pigmentation",
  "Dark Spots & Brightening": "Dark Spots & Pigmentation",
  "hyperpigmentation": "Dark Spots & Pigmentation",
  "dullness": "Dull Skin",
  "dryness": "Dryness & Dehydration",
  "dehydration": "Dryness & Dehydration",
  "Exfoliating / Texture": "Uneven Texture",
  "rosacea": "Rosacea",
  "damaged barrier": "Damaged Barrier",
  "sun-damage": "Sun Damage",
};

// Super Robust Score Parser
const parseScore = (val: any): number => {
  if (val === null || val === undefined) return 0;

  if (typeof val === "number" && !isNaN(val)) {
    return val <= 1 && val > 0 ? val * 100 : val;
  }

  if (typeof val === "string") {
    const parsed = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed)) {
      return parsed <= 1 && parsed > 0 ? parsed * 100 : parsed;
    }
    return 0;
  }

  if (Array.isArray(val)) {
    const validNums = val.map((v) => parseScore(v)).filter((v) => v > 0);
    if (validNums.length === 0) return 0;
    return validNums.reduce((a, b) => a + b, 0) / validNums.length;
  }

  if (typeof val === "object") {
    const keysToCheck = [
      "score",
      "healthScore",
      "health",
      "val",
      "value",
      "percent",
      "percentage",
      "rating",
    ];
    for (const key of keysToCheck) {
      if (val[key] !== undefined) {
        const res = parseScore(val[key]);
        if (res > 0) return res;
      }
    }

    for (const nestedVal of Object.values(val)) {
      const res = parseScore(nestedVal);
      if (res > 0) return res;
    }
  }

  return 0;
};

// Clean region label formatter
const formatRegionName = (name: string) => {
  const clean = name
    .replace(/zone/gi, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
  return (clean.charAt(0).toUpperCase() + clean.slice(1)).trim() + " Zone";
};

export default function ResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const searchParams = useSearchParams();

  const [logData, setLogData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingRoutine, setIsGeneratingRoutine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"AM" | "PM">("AM");

  // Cart & Modal States
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingFull, setAddingFull] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Confirmation States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmQuestion, setConfirmQuestion] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const isConfirm = searchParams.get("confirm");
    const question = searchParams.get("q");
    if (isConfirm === "true") {
      setConfirmQuestion(question || "Does your skin feel tight after washing?");
      setShowConfirmModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchResultsAndProcess() {
      try {
        setLoading(true);
        const { data, error: fetchErr } = await supabase
          .from("skin_analysis_logs")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (fetchErr) throw fetchErr;

        setLogData(data);

        if (
          data &&
          (!data.routine_snapshot || !data.routine_snapshot.amRoutine)
        ) {
          await generateRoutineOnTheFly(data);
        }
      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError("Could not load your skin analysis report. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) fetchResultsAndProcess();
  }, [sessionId]);

  const generateRoutineOnTheFly = async (record: any) => {
    try {
      setIsGeneratingRoutine(true);

      let concernsForApi: Record<string, number> = {};

      if (record.method === "photo" && record.concern_scores) {
        const scores = record.concern_scores.scores || {};
        const concernsList = record.concern_scores.concerns_list || [];

        concernsList.forEach((c: string) => {
          concernsForApi[c] = 8;
        });

        Object.entries(scores).forEach(([k, v]) => {
          concernsForApi[k] = Number(v);
        });
      } else if (record.concern_scores) {
        concernsForApi = record.concern_scores;
      }

      const response = await fetch("/api/generate-routine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: record.id,
          userSkinType: record.skin_type || "Combination",
          concernScores: concernsForApi,
        }),
      });
      if (!response.ok) throw new Error("Failed to generate AI routine");

      const resData = await response.json();

      setLogData((prev: any) => ({
        ...prev,
        routine_snapshot: {
          amRoutine: resData.data.amRoutine,
          pmRoutine: resData.data.pmRoutine,
        },
        ai_summary: resData.data.summary,
      }));
    } catch (apiErr) {
      console.error("Failed to generate routine dynamically:", apiErr);
    } finally {
      setIsGeneratingRoutine(false);
    }
  };

  const handleSkinConfirmation = async (isYes: boolean) => {
    if (!isYes) {
      setShowConfirmModal(false);
      return;
    }

    try {
      setIsConfirming(true);
      const response = await fetch("/api/skin-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          confirmDrySkin: true, 
          sessionId: sessionId 
        }),
      });

      if (!response.ok) throw new Error("Failed to update skin type");

      const updatedData = await response.json();

      setLogData((prev: any) => ({
        ...prev,
        skin_type: updatedData.userSkinType || "Dry",
        ai_summary: updatedData.summary || prev?.ai_summary,
        concern_scores: {
          ...prev?.concern_scores,
          main_concerns: updatedData.mainConcerns || prev?.concern_scores?.main_concerns
        }
      }));
    } catch (err) {
      console.error("Confirmation API Error:", err);
    } finally {
      setIsConfirming(false);
      setShowConfirmModal(false);
    }
  };

  // --- CART HANDLERS ---
  const handleAddToCart = (product: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetKey = product.product_key || product.id;
    setAddingId(targetKey);

    addToCart({
      product_key: targetKey,
      shade_key: "no-shade",
      shade_name: "Standard",
      quantity: 1,
      name: product.name,
      brand: product.brand,
      price: product.price || 0,
      image_url: product.image_url,
    });

    setTimeout(() => setAddingId(null), 1200);
  };

  const handleAddRoutineToCart = (routineArray: any[]) => {
    setAddingFull(true);
    routineArray.forEach((item) => {
      const product = item.product || item;
      addToCart({
        product_key: product.product_key || product.id,
        shade_key: "no-shade",
        shade_name: "Standard",
        quantity: 1,
        name: product.name,
        brand: product.brand,
        price: product.price || 0,
        image_url: product.image_url,
      });
    });
    setTimeout(() => setAddingFull(false), 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] gap-4">
        <Sparkles className="w-10 h-10 animate-spin text-[var(--rose-primary)]" />
        <p className="text-[var(--text-secondary)] font-medium text-sm animate-pulse">
          Analyzing your skin diagnostics and compiling personalized routine...
        </p>
      </div>
    );
  }

  if (error || !logData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] p-4 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Report Generation Failed
        </h2>
        <p className="text-gray-600 mb-6 max-w-md">
          {error || "Could not retrieve skin profile."}
        </p>
        <Link href="/skin-analysis/scan" className="ui-btn">
          Start New Analysis
        </Link>
      </div>
    );
  }

  // --- DATA PARSING ---
  const isPhotoMethod = logData.method === "photo";
  const userSkinType = logData.skin_type || "Combination";

  let detectedConcerns: string[] = [];
  let overallScore: number | null = null;
  let regionBreakdown: Record<string, any> | null = null;

  if (logData.concern_scores) {
    detectedConcerns =
      logData.concern_scores.main_concerns ||
      logData.concern_scores.concerns_list ||
      Object.entries(logData.concern_scores)
        .filter(([k, score]) => k !== "main_concerns" && Number(score) > 0)
        .map(([concern]) => concern);
  }

  const displayConcerns = Array.from(
    new Set(
      detectedConcerns
        .map((tag) => UI_CONCERNS_MAPPING[tag])
        .filter((name): name is string => Boolean(name))
    )
  );

  if (isPhotoMethod && logData.routine_snapshot) {
    overallScore = logData.routine_snapshot.overallSkinScore || null;
    regionBreakdown = logData.routine_snapshot.regionalHealthScores || null;
  }

  // Routine Parsing
  let am = [],
    pm = [];
  if (logData?.routine_snapshot) {
    am =
      logData.routine_snapshot.amRoutine ||
      logData.routine_snapshot.am_routine ||
      logData.routine_snapshot.AM ||
      [];
    pm =
      logData.routine_snapshot.pmRoutine ||
      logData.routine_snapshot.pm_routine ||
      logData.routine_snapshot.PM ||
      [];
  }

  const routines = { AM: am, PM: pm };
  const currentRoutine = routines[activeTab];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="mx-auto w-full max-w-5xl">
        {/* TOP BAR / NAVIGATION */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href={
              isPhotoMethod
                ? "/skin-analysis/scan"
                : "/skin-analysis/questionnaire"
            }
            className="inline-flex items-center text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--rose-primary)] transition"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Retake Analysis
          </Link>
          <div className="flex items-center gap-2">
            <span className="ui-badge bg-white shadow-sm border border-[var(--border-soft)] text-xs flex items-center gap-1.5">
              {isPhotoMethod ? (
                <Camera className="w-3.5 h-3.5 text-[var(--rose-primary)]" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-[var(--rose-primary)]" />
              )}
              {isPhotoMethod ? "Face Mesh AI Scan" : "Questionnaire Analysis"}
            </span>
          </div>
        </div>

        {/* HERO DIAGNOSTIC PROFILE CARD */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="ui-card p-6 md:p-8 mb-8 bg-white shadow-sm rounded-3xl border border-[var(--border-soft)] overflow-hidden relative"
        >
          <div className="flex flex-col md:flex-row gap-8 items-center">
            {/* Scanned Image Preview */}
            {isPhotoMethod && logData.image_url ? (
              <div className="relative shrink-0">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden border-2 border-[var(--rose-primary)]/30 shadow-md">
                  <img
                    src={logData.image_url}
                    alt="Facial Scan Analysis"
                    className="w-full h-full object-cover"
                  />
                </div>
                {overallScore && (
                  <div className="absolute -bottom-3 -right-3 bg-white px-3 py-1 rounded-full border-2 border-[var(--rose-primary)] shadow-md flex items-center gap-1">
                    <Award className="w-4 h-4 text-[var(--rose-primary)]" />
                    <span className="text-xs font-bold text-[var(--text-main)]">
                      {overallScore}/100
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-28 h-28 rounded-2xl bg-[var(--rose-soft)]/40 flex items-center justify-center shrink-0 border border-[var(--rose-primary)]/20">
                <Droplets className="w-12 h-12 text-[var(--rose-primary)]" />
              </div>
            )}

            {/* Diagnostics Summary */}
            <div className="flex-1 text-center md:text-left">
              <span className="ui-badge mb-2 inline-block">
                AI Diagnostic Report
              </span>
              <h1 className="ui-h1 text-2xl md:text-3xl mb-3">
                Skin Profile Assessment
              </h1>

              {/* CLEAN BADGES RENDERING */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
                <div className="bg-[var(--rose-soft)]/50 text-[var(--rose-primary)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--rose-primary)]/20">
                  Type: <span className="capitalize">{userSkinType}</span>
                </div>

                {displayConcerns.length > 0 ? (
                  displayConcerns.map((concern, idx) => (
                    <span
                      key={idx}
                      className="bg-gray-100 text-gray-700 font-medium text-xs px-3 py-1.5 rounded-lg border border-gray-200"
                    >
                      {concern}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500 italic">
                    Overall Skin Maintenance
                  </span>
                )}
              </div>

              <p className="ui-muted text-sm leading-relaxed max-w-2xl">
                {logData.ai_summary ||
                  `Our AI Dermatologist matched products specifically formulated to balance your ${userSkinType.toLowerCase()} skin and address ${
                    displayConcerns.join(", ") || "daily maintenance"
                  }.`}
              </p>
            </div>
          </div>

          {/* FACIAL REGION BREAKDOWN */}
          {isPhotoMethod && regionBreakdown && (
            <div className="mt-6 pt-6 border-t border-[var(--border-soft)]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[var(--rose-primary)]" />{" "}
                Regional Health Index
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {Object.entries(regionBreakdown).map(([region, scoreRaw]) => {
                  const scoreValue = parseScore(scoreRaw);
                  return (
                    <div
                      key={region}
                      className="bg-gray-50 p-3 rounded-xl border border-[var(--border-soft)] text-center"
                    >
                      <span className="text-[11px] font-semibold capitalize text-gray-500 block mb-1">
                        {formatRegionName(region)}
                      </span>
                      <span className="text-base font-bold text-[var(--text-main)]">
                        {Math.round(scoreValue)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* TABS SWITCHER */}
        <div className="flex justify-center mb-8">
          <div className="bg-white p-1 rounded-full border border-[var(--border-soft)] shadow-sm inline-flex">
            <button
              onClick={() => setActiveTab("AM")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                activeTab === "AM"
                  ? "bg-[var(--rose-primary)] text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-[var(--rose-primary)]"
              }`}
            >
              <Sun className="w-4 h-4" /> Morning Routine
            </button>
            <button
              onClick={() => setActiveTab("PM")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                activeTab === "PM"
                  ? "bg-slate-800 text-white shadow-md"
                  : "text-[var(--text-muted)] hover:text-slate-800"
              }`}
            >
              <Moon className="w-4 h-4" /> Night Routine
            </button>
          </div>
        </div>

        {/* BUNDLE ADD TO CART */}
        {currentRoutine.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-5 rounded-2xl border border-[var(--border-soft)] shadow-sm">
            <div>
              <h3 className="ui-h2 text-base">
                Complete {activeTab === "AM" ? "Morning" : "Night"} Regimen
              </h3>
              <p className="ui-muted text-xs mt-0.5">
                {currentRoutine.length} clinical-grade products target-matched
                for your profile
              </p>
            </div>
            <button
              onClick={() => handleAddRoutineToCart(currentRoutine)}
              disabled={addingFull}
              className="ui-btn w-full sm:w-auto shrink-0 justify-center"
            >
              {addingFull ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Added Regimen to Cart
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" /> Add Complete Routine
                </>
              )}
            </button>
          </div>
        )}

        {/* LOADING STATE FOR ON-THE-FLY ROUTINE */}
        {isGeneratingRoutine && (
          <div className="bg-white p-12 rounded-3xl text-center border border-[var(--border-soft)] shadow-sm">
            <Sparkles className="w-8 h-8 text-[var(--rose-primary)] animate-spin mx-auto mb-3" />
            <h3 className="font-bold text-gray-800 text-base mb-1">
              Building Routine Steps...
            </h3>
            <p className="text-xs text-gray-500">
              Matching products against catalog ingredients and skin profile.
            </p>
          </div>
        )}

        {/* ROUTINE CARDS GRID */}
        {!isGeneratingRoutine && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {currentRoutine.map((item: any, index: number) => {
              const product = item.product || item;
              const isAdding = addingId === (product.product_key || product.id);

              return (
                <div
                  key={index}
                  onClick={() => setSelectedItem(item)}
                  className="ui-card relative overflow-hidden flex flex-col group hover:shadow-lg hover:border-[var(--rose-primary)]/50 transition-all cursor-pointer bg-white"
                >
                  {/* Match Score Badge */}
                  <div className="absolute top-3 right-3 z-10">
                    <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-[var(--rose-primary)]">
                      <span className="text-[var(--rose-primary)] font-bold text-xs">
                        {Math.round(item.matchScore || 92)}%
                      </span>
                    </div>
                  </div>

                  {/* Product Image */}
                  <div className="h-48 bg-gray-50 flex items-center justify-center border-b border-[var(--border-soft)] p-4 relative">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <Sparkles className="w-8 h-8 text-gray-300" />
                    )}

                    <span className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm text-[var(--text-secondary)] text-[10px] font-bold uppercase px-2.5 py-1 rounded-md shadow-sm border border-[var(--border-soft)]">
                      Step {index + 1} • {product.category || "Care"}
                    </span>
                  </div>

                  {/* Card Info */}
                  <div className="p-5 flex flex-col flex-1">
                    <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase mb-1">
                      {product.brand}
                    </p>
                    <h3 className="ui-h2 text-base leading-tight mb-3 group-hover:text-[var(--rose-primary)] transition-colors line-clamp-2">
                      {product.name}
                    </h3>

                    {/* AI Reason Preview */}
                    {item.matchReason && (
                      <p className="text-xs text-gray-500 line-clamp-2 italic mb-4 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        "{item.matchReason}"
                      </p>
                    )}

                    {/* Price & Action */}
                    <div className="mt-auto pt-4 border-t border-[var(--border-soft)] flex items-center justify-between">
                      <span className="text-lg font-bold text-[var(--text-main)]">
                        ${product.price || "0.00"}
                      </span>
                      <button
                        onClick={(e) => handleAddToCart(product, e)}
                        disabled={isAdding}
                        className={`p-2.5 rounded-xl transition-all ${
                          isAdding
                            ? "bg-[var(--rose-primary)] text-white"
                            : "bg-[var(--bg-base)] hover:bg-[var(--rose-primary)]/10 text-[var(--rose-primary)] border border-[var(--rose-primary)]/20"
                        }`}
                      >
                        {isAdding ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <ShoppingCart className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* EMPTY ROUTINE FALLBACK */}
        {!isGeneratingRoutine && currentRoutine.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-[var(--border-soft)]">
            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-700">
              No {activeTab} steps found
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Switch to the other routine tab or re-run the scan.
            </p>
          </div>
        )}
      </div>

      {/* --- QUICK VIEW DETAIL MODAL --- */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden relative flex flex-col md:flex-row max-h-[90vh]"
            >
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>

              {/* Modal Image */}
              <div className="md:w-2/5 bg-gray-50 p-8 flex items-center justify-center border-r border-[var(--border-soft)]">
                {selectedItem.product?.image_url || selectedItem.image_url ? (
                  <img
                    src={
                      selectedItem.product?.image_url || selectedItem.image_url
                    }
                    alt="Product detail"
                    className="max-h-64 object-contain mix-blend-multiply"
                  />
                ) : (
                  <Sparkles className="w-16 h-16 text-gray-300" />
                )}
              </div>

              {/* Modal Details */}
              <div className="md:w-3/5 p-8 flex flex-col overflow-y-auto">
                <div className="flex items-center gap-2 mb-2">
                  <span className="ui-badge bg-[var(--rose-primary)]/10 text-[var(--rose-primary)] border-none">
                    {Math.round(selectedItem.matchScore || 92)}% Match
                  </span>
                  <span className="ui-badge bg-emerald-50 text-emerald-700 border-none">
                    Skin Friendly
                  </span>
                </div>

                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-1">
                  {selectedItem.product?.brand || selectedItem.brand}
                </p>
                <h2 className="text-xl font-bold text-[var(--text-main)] mb-4">
                  {selectedItem.product?.name || selectedItem.name}
                </h2>

                {/* AI Rationale Box */}
                <div className="bg-[var(--rose-soft)]/20 border border-[var(--rose-soft)]/50 rounded-xl p-4 flex gap-3 mb-6">
                  <Sparkles className="w-5 h-5 text-[var(--rose-primary)] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[var(--rose-primary)] mb-1 uppercase tracking-wider">
                      Dermatologist AI Recommendation:
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                      "
                      {selectedItem.matchReason ||
                        "Formulated to complement your specific skin profile and concerns without causing irritation."}
                      "
                    </p>
                  </div>
                </div>

                <div className="mt-auto pt-6 flex items-center justify-between border-t border-[var(--border-soft)]">
                  <span className="text-2xl font-bold text-[var(--text-main)]">
                    $
                    {selectedItem.product?.price ||
                      selectedItem.price ||
                      "0.00"}
                  </span>
                  <button
                    onClick={() => {
                      handleAddToCart(selectedItem.product || selectedItem);
                      setSelectedItem(null);
                    }}
                    className="ui-btn shadow-md hover:shadow-lg transition-all"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- CONFIRMATION MODAL --- */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center relative overflow-hidden"
            >
              <div className="w-16 h-16 bg-[var(--rose-soft)] text-[var(--rose-primary)] rounded-full flex items-center justify-center mx-auto mb-5">
                <Sparkles size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                One Last Question!
              </h2>
              <p className="text-gray-600 mb-8 font-medium">
                {confirmQuestion}
              </p>

              {isConfirming ? (
                <div className="py-4">
                  <div className="w-8 h-8 border-4 border-[var(--rose-soft)] border-t-[var(--rose-primary)] rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Updating your profile...</p>
                </div>
              ) : (
                <div className="flex gap-4">
                  <button
                    onClick={() => handleSkinConfirmation(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition"
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleSkinConfirmation(true)}
                    className="flex-1 px-4 py-3 rounded-xl bg-[var(--rose-primary)] text-white font-semibold hover:opacity-90 transition shadow-md"
                  >
                    Yes
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}