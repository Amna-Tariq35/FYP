"use client";

import React from "react";
import CheckoutSteps from "./CheckoutSteps";

type ShellStep = "shipping" | "payment" | "success";

type Props = {
  step: ShellStep;
  title?: string;
  subtitle?: string;
  left: React.ReactNode;
  right?: React.ReactNode;
};

export default function CheckoutShell({
  step,
  title = "Checkout",
  subtitle,
  left,
  right,
}: Props) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-main)]">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>

        {/* Steps */}
        <div className="mb-6">
          <CheckoutSteps current={step} />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left — form / content */}
          <div className="lg:col-span-7">
            <div className="ui-card">
              <div className="ui-card-body">{left}</div>
            </div>
          </div>

          {/* Right — order summary */}
          {right ? (
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-24 space-y-4">
                <div className="ui-card">
                  <div className="ui-card-body">{right}</div>
                </div>

                {/* Secure checkout note */}
                <div
                  className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: "var(--border-soft)",
                    background: "color-mix(in srgb, white 85%, var(--bg-base))",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="mt-0.5 shrink-0 text-[#C06C84]"
                  >
                    <path
                      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path
                      d="m9 12 2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-main)]">
                      Secure checkout
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Your payment information is encrypted and never stored on
                      our servers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}