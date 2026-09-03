"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, CheckCircle2, Sparkles, Droplets, Info } from "lucide-react";

type Product = {
  step: string;
  name: string;
  brand: string;
  matchScore: number;
  matchReason: string;
  keyIngredient: string;
};

type RoutineData = {
  skinType: string;
  concerns: string[];
  routine: {
    am: Product[];
    pm: Product[];
  };
};

// --- CUSTOM COMPONENT: Circular Match Score ---
const CircularScore = ({ score }: { score: number }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
      <svg className="transform -rotate-90 w-12 h-12">
        <circle 
          cx="24" cy="24" r={radius} 
          stroke="currentColor" strokeWidth="3" fill="transparent" 
          className="text-[var(--border-soft)]" 
        />
        <motion.circle 
          cx="24" cy="24" r={radius} 
          stroke="currentColor" strokeWidth="3" fill="transparent" 
          strokeDasharray={circumference} 
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
          className="text-[var(--rose-primary)]" 
        />
      </svg>
      <span className="absolute text-xs font-bold text-[var(--text-main)]">{score}%</span>
    </div>
  );
};

// --- MAIN CLIENT COMPONENT ---
export default function ResultsClient({ data }: { data: RoutineData }) {
  const [activeTab, setActiveTab] = useState<"am" | "pm">("am");
  const products = activeTab === "am" ? data.routine.am : data.routine.pm;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      
      {/* HEADER SECTION */}
      <div className="w-full max-w-3xl mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--rose-soft)]/50 text-[var(--rose-primary)] text-sm font-semibold mb-4 border border-[var(--rose-primary)]/20">
          <Sparkles className="w-4 h-4" /> AI Analysis Complete
        </div>
        <h1 className="ui-h1 mb-4">Your Personalized Routine</h1>
        
        {/* User Profile Summary Tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <span className="px-3 py-1 bg-white border border-[var(--border-soft)] rounded-full text-sm text-[var(--text-secondary)] shadow-sm flex items-center gap-1.5">
            <Droplets className="w-4 h-4 text-[var(--rose-primary)]" />
            {data.skinType} Skin
          </span>
          {data.concerns.map(c => (
            <span key={c} className="px-3 py-1 bg-white border border-[var(--border-soft)] rounded-full text-sm text-[var(--text-secondary)] shadow-sm capitalize">
              Targeting: {c}
            </span>
          ))}
        </div>
      </div>

      <div className="w-full max-w-3xl">
        {/* AM / PM TABS TOGGLE */}
        <div className="flex p-1 bg-white border border-[var(--border-soft)] rounded-xl mb-8 relative shadow-sm">
          {/* AM Tab */}
          <button
            onClick={() => setActiveTab("am")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold z-10 transition-colors ${
              activeTab === "am" ? "text-[var(--rose-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <Sun className="w-5 h-5" /> Morning Routine
          </button>
          
          {/* PM Tab */}
          <button
            onClick={() => setActiveTab("pm")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold z-10 transition-colors ${
              activeTab === "pm" ? "text-indigo-600" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <Moon className="w-5 h-5" /> Evening Routine
          </button>

          {/* Animated Highlight Background */}
          <motion.div
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg ${
              activeTab === "am" ? "bg-[var(--rose-soft)]/30 left-1" : "bg-indigo-50 right-1"
            }`}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>

        {/* PRODUCT CARDS LIST */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {products.map((product, index) => (
              <motion.div
                key={product.name + activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="ui-card p-0 overflow-hidden flex flex-col sm:flex-row group"
              >
                {/* Left Side: Step & Brand Info */}
                <div className="p-5 sm:w-1/3 bg-gray-50/50 border-b sm:border-b-0 sm:border-r border-[var(--border-soft)] flex flex-col justify-center relative">
                  {/* Subtle active tab color hint */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${activeTab === 'am' ? 'bg-[var(--rose-primary)]' : 'bg-indigo-500'}`}></div>
                  
                  <span className="text-xs font-bold tracking-wider text-[var(--text-muted)] uppercase mb-1">
                    {product.step}
                  </span>
                  <h3 className="font-bold text-[var(--text-main)] text-lg leading-tight mb-1">
                    {product.name}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">by {product.brand}</p>
                  
                  <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-[var(--border-soft)] w-max shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-xs font-medium text-[var(--text-main)]">{product.keyIngredient}</span>
                  </div>
                </div>

                {/* Right Side: AI Match Logic */}
                <div className="p-5 sm:w-2/3 flex flex-col justify-center">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-[var(--rose-primary)] to-pink-500 text-white shadow-sm">
                          Perfect Match
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed flex items-start gap-2">
                        <Info className="w-4 h-4 text-[var(--rose-primary)] shrink-0 mt-0.5" />
                        {product.matchReason}
                      </p>
                    </div>
                    
                    {/* Circular Score Badge */}
                    <CircularScore score={product.matchScore} />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}