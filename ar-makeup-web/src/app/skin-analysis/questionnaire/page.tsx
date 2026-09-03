"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Droplet,
  Wind,
  Sun,
  Activity,
  Feather,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

// --- 1. DATA STRUCTURES ---
const SKIN_TYPES = [
  { id: "Oily", icon: Droplet, label: "Oily", desc: "Shiny all over, prone to breakouts & enlarged pores." },
  { id: "Dry", icon: Wind, label: "Dry", desc: "Feels tight, flaky, or rough. Needs constant moisture." },
  { id: "Combination", icon: Activity, label: "Combination", desc: "Oily T-zone, but dry or normal cheeks." },
  { id: "Normal", icon: Sun, label: "Normal", desc: "Well-balanced, not too oily or too dry." },
  { id: "Sensitive", icon: Feather, label: "Sensitive", desc: "Easily irritated, prone to redness or stinging." },
];

const DB_CONCERNS = [
  { value: "acne", label: "Acne & Breakouts" },
  { value: "oiliness", label: "Oiliness" },
  { value: "dryness", label: "Dryness" },
  { value: "dehydration", label: "Dehydration" },
  { value: "redness", label: "Redness" },
  { value: "rosacea", label: "Rosacea" },
  { value: "irritation", label: "Sensitivity / Irritation" },
  { value: "damaged barrier", label: "Damaged Barrier" },
  { value: "dullness", label: "Dullness" },
  { value: "dark spots", label: "Dark Spots / Hyperpigmentation" },
  { value: "sun-damage", label: "Sun Damage" },
  { value: "anti-aging", label: "Anti-Aging" },
];

const MAX_CONCERNS = 5;

const LOADING_MESSAGES = [
  "Analyzing your profile...",
  "Scanning 1,100+ active ingredients...",
  "Consulting AI Dermatologist...",
  "Crafting your perfect routine...",
];

function severityLabel(value: number): string {
  if (value <= 3) return "Mild";
  if (value <= 7) return "Moderate";
  return "Severe";
}

// --- 2. MAIN COMPONENT ---
export default function QuestionnairePage() {
  const router = useRouter();

  // State Management
  const [currentStep, setCurrentStep] = useState(1);
  const [skinType, setSkinType] = useState<string | null>(null);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [concernSeverity, setConcernSeverity] = useState<Record<string, number>>({});

  // Submission & Loading States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);

  // Cycle loading messages when submitting
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSubmitting) {
      interval = setInterval(() => {
        setLoadingIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [isSubmitting]);

  // Handlers
  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, 3));
  const handleBack = () => {
    setErrorMsg(null);
    setIsAiBusy(false);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const toggleConcern = (concern: string) => {
    setSelectedConcerns((prev) => {
      if (prev.includes(concern)) {
        const newSeverities = { ...concernSeverity };
        delete newSeverities[concern];
        setConcernSeverity(newSeverities);
        return prev.filter((c) => c !== concern);
      }
      if (prev.length >= MAX_CONCERNS) return prev;
      setConcernSeverity({ ...concernSeverity, [concern]: 5 });
      return [...prev, concern];
    });
  };

// --- API SUBMISSION LOGIC ---
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setIsAiBusy(false);

    // Transform Slider values (1-10) to AI Engine values (0.1-1.0)
    const formattedScores: Record<string, number> = {};
    selectedConcerns.forEach((c) => {
      formattedScores[c] = (concernSeverity[c] || 5) / 10;
    });

    try {
      const res = await fetch("/api/skin-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "questionnaire", // 👉 YE LINE MISSING THI
          skinType: skinType,      // Match backend keys
          mainConcerns: selectedConcerns, // Backend expects array of strings
          concernScores: formattedScores,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "AI_BUSY") {
          setIsAiBusy(true);
          setErrorMsg(data.message || "Our AI Dermatologists are receiving high traffic right now. Please try submitting again in a few seconds.");
          setIsSubmitting(false);
          return;
        }
        throw new Error(data.message || data.error || "Failed to generate routine");
      }

      // Success! Redirect to dynamic results page with the DB log ID
      router.push(`/skin-analysis/results/${data.sessionId}`);
    } catch (err: any) {
      console.error("Submission Error:", err);
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Animation Variants
  const stepVariants: Variants = {
    hidden: { opacity: 0, x: 20, filter: "blur(4px)" },
    visible: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, x: -20, filter: "blur(4px)", transition: { duration: 0.3, ease: "easeIn" } },
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      {/* HEADER / PROGRESS BAR */}
      <div className="w-full max-w-3xl mb-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="ui-h1 flex items-center gap-2">
              <Sparkles className="text-[var(--rose-primary)] w-6 h-6" />
              Skin Analysis
            </h1>
            <p className="ui-muted mt-1">Let AI craft your perfect routine.</p>
          </div>
          {!isSubmitting && (
            <span className="text-[var(--rose-primary)] font-semibold text-sm">
              Step {currentStep} of 3
            </span>
          )}
        </div>

        {/* Progress Line */}
        <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-[var(--border-soft)]">
          <motion.div
            className="h-full bg-[var(--rose-primary)] rounded-full relative"
            initial={{ width: "33%" }}
            animate={{ width: isSubmitting ? "100%" : `${(currentStep / 3) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            {isSubmitting && <div className="absolute inset-0 bg-white/30 animate-pulse"></div>}
          </motion.div>
        </div>
      </div>

      {/* FORM CONTAINER */}
      <div className="ui-section w-full max-w-3xl p-6 sm:p-10 shadow-sm relative overflow-hidden min-h-[480px] flex flex-col justify-between">
        
        {/* HIGH TRAFFIC / AI BUSY BANNER */}
        {isAiBusy && (
          <div className="mb-6 p-6 bg-[var(--rose-soft)]/20 border border-[var(--rose-primary)]/30 rounded-2xl flex flex-col items-center text-center animate-in fade-in slide-in-from-top-2">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-[var(--rose-primary)]">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="ui-h2 text-base text-[var(--text-main)] mb-1">AI Dermatologist is Busy</h3>
            <p className="ui-muted text-sm leading-relaxed mb-5 max-w-md">
              {errorMsg}
            </p>
            <button
              onClick={handleSubmit}
              className="ui-btn flex items-center gap-2 px-6 py-2.5 text-sm"
            >
              <RotateCcw className="w-4 h-4" /> Try Again Now
            </button>
          </div>
        )}

        {/* STANDARD ERROR ALERT */}
        {errorMsg && !isAiBusy && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Analysis Failed</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ================= STEP 1: SKIN TYPE ================= */}
          {currentStep === 1 && !isSubmitting && (
            <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1">
              <h2 className="ui-h2 mb-2">What is your primary skin type?</h2>
              <p className="ui-muted mb-6">Select the one that best describes your skin on a normal day.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SKIN_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = skinType === type.id;
                  return (
                    <div
                      key={type.id}
                      onClick={() => setSkinType(type.id)}
                      className={`ui-card cursor-pointer p-4 flex items-start gap-4 transition-all duration-300 hover:-translate-y-1 ${
                        isSelected
                          ? "border-[var(--rose-primary)] bg-[var(--rose-soft)]/20 ring-1 ring-[var(--rose-primary)]"
                          : "hover:border-[var(--rose-primary)]/50"
                      }`}
                    >
                      <div
                        className={`p-3 rounded-full ${
                          isSelected ? "bg-[var(--rose-primary)] text-white" : "bg-[var(--bg-base)] text-[var(--text-secondary)]"
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className={`font-semibold ${isSelected ? "text-[var(--rose-primary)]" : "text-[var(--text-main)]"}`}>
                          {type.label}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{type.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ================= STEP 2: CONCERNS ================= */}
          {currentStep === 2 && !isSubmitting && (
            <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1">
              <div className="flex items-start justify-between mb-2 gap-4">
                <h2 className="ui-h2">What are your main skin concerns?</h2>
                <span
                  className={`shrink-0 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selectedConcerns.length >= MAX_CONCERNS
                      ? "bg-[var(--rose-primary)] text-white"
                      : "bg-[var(--rose-soft)]/40 text-[var(--rose-primary)]"
                  }`}
                >
                  {selectedConcerns.length}/{MAX_CONCERNS}
                </span>
              </div>
              <p className="ui-muted mb-6">Pick up to {MAX_CONCERNS} — we'll prioritize these in your routine.</p>

              <div className="flex flex-wrap gap-3">
                {DB_CONCERNS.map((concern) => {
                  const isSelected = selectedConcerns.includes(concern.value);
                  const isDisabled = !isSelected && selectedConcerns.length >= MAX_CONCERNS;
                  return (
                    <button
                      key={concern.value}
                      onClick={() => toggleConcern(concern.value)}
                      disabled={isDisabled}
                      className={`transition-all duration-200 text-sm px-5 py-2.5 rounded-full border ${
                        isSelected
                          ? "bg-[var(--rose-primary)] border-[var(--rose-primary)] text-white shadow-md scale-105"
                          : isDisabled
                          ? "bg-white border-[var(--border-soft)] text-[var(--text-muted)]/50 cursor-not-allowed"
                          : "bg-white border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--rose-soft)]/20 hover:border-[var(--rose-primary)]/50"
                      }`}
                    >
                      {concern.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ================= STEP 3: SEVERITY SLIDERS ================= */}
          {currentStep === 3 && !isSubmitting && (
            <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="flex-1">
              <h2 className="ui-h2 mb-2">How severe are these concerns?</h2>
              <p className="ui-muted mb-6">Adjust the sliders so we know what needs the most attention.</p>

              <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedConcerns.map((concernValue) => {
                  const meta = DB_CONCERNS.find((c) => c.value === concernValue);
                  const value = concernSeverity[concernValue] ?? 5;
                  return (
                    <div key={concernValue} className="ui-card p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-semibold text-[var(--text-main)]">{meta?.label ?? concernValue}</span>
                        <span className="bg-[var(--rose-soft)] text-[var(--rose-primary)] px-2 py-1 rounded-md text-xs font-bold">
                          {severityLabel(value)} ({value})
                        </span>
                      </div>

                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={value}
                        onChange={(e) => setConcernSeverity({ ...concernSeverity, [concernValue]: parseInt(e.target.value) })}
                        className="w-full accent-[var(--rose-primary)] cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2 font-medium">
                        <span>Mild (1)</span>
                        <span>Severe (10)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ================= LOADING / SUBMITTING STATE ================= */}
          {isSubmitting && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center py-10"
            >
              <div className="relative">
                <Loader2 className="w-16 h-16 text-[var(--rose-soft)] animate-spin" />
                <Sparkles className="w-6 h-6 text-[var(--rose-primary)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>

              <div className="mt-8 h-8 overflow-hidden relative w-full">
                <AnimatePresence mode="popLayout">
                  <motion.p
                    key={loadingIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="ui-h2 text-[var(--rose-primary)] absolute w-full"
                  >
                    {LOADING_MESSAGES[loadingIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>
              <p className="ui-muted mt-4">Please don't close this page.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ================= NAVIGATION FOOTER ================= */}
        {!isSubmitting && (
          <>
            <div className="ui-divider mt-8 mb-4"></div>
            <div className="flex justify-between items-center">
              <button onClick={handleBack} className={`ui-btn-secondary ${currentStep === 1 ? "opacity-0 pointer-events-none" : ""}`}>
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              {currentStep < 3 ? (
                <button
                  onClick={handleNext}
                  disabled={(currentStep === 1 && !skinType) || (currentStep === 2 && selectedConcerns.length === 0)}
                  className="ui-btn"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleSubmit} className="ui-btn px-8 shadow-lg shadow-[var(--rose-primary)]/30 group">
                  Analyze Skin <Sparkles className="w-4 h-4 ml-1 group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}