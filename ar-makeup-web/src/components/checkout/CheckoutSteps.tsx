"use client";

import React from "react";

type StepKey = "shipping" | "payment" | "success";

const steps: { key: StepKey; label: string }[] = [
  { key: "shipping", label: "Shipping" },
  { key: "payment", label: "Payment" },
  { key: "success", label: "Confirmed" },
];

const stepOrder: StepKey[] = ["shipping", "payment", "success"];

function isCompleted(current: StepKey, step: StepKey) {
  return stepOrder.indexOf(step) < stepOrder.indexOf(current);
}

function isActive(current: StepKey, step: StepKey) {
  return current === step;
}

export default function CheckoutSteps({ current }: { current: StepKey }) {
  return (
    <div className="ui-card">
      <div className="ui-card-body">
        <div className="flex items-center justify-between gap-3">
          {steps.map((s, idx) => {
            const completed = isCompleted(current, s.key);
            const active = isActive(current, s.key);

            return (
              <React.Fragment key={s.key}>
                <div className="flex items-center gap-3 min-w-0">
                  {/* Step circle */}
                  <div
                    className={[
                      "h-8 w-8 shrink-0 rounded-full flex items-center justify-center border transition-all",
                      active
                        ? "bg-[#C06C84] text-white border-transparent shadow-sm shadow-[#C06C84]/30"
                        : completed
                        ? "bg-white text-[#C06C84] border-[#C06C84]"
                        : "bg-white text-[var(--text-muted)] border-[var(--border-soft)]",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {completed ? (
                      /* Checkmark SVG for completed steps */
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="m5 13 4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="text-xs font-bold">{idx + 1}</span>
                    )}
                  </div>

                  {/* Label */}
                  <div className="min-w-0">
                    <div
                      className={[
                        "text-sm font-semibold truncate",
                        active
                          ? "text-[var(--text-main)]"
                          : completed
                          ? "text-[var(--text-secondary)]"
                          : "text-[var(--text-muted)]",
                      ].join(" ")}
                    >
                      {s.label}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {active ? "In progress" : completed ? "Done" : "Pending"}
                    </div>
                  </div>
                </div>

                {/* Connector line */}
                {idx !== steps.length - 1 && (
                  <div
                    className="hidden sm:block flex-1 h-px transition-all"
                    style={{
                      background: completed
                        ? "color-mix(in srgb, #C06C84 40%, var(--border-soft))"
                        : "var(--border-soft)",
                    }}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}