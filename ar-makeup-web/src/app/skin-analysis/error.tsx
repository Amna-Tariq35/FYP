"use client";

import Link from "next/link";

export default function SkinAnalysisError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-main)]">Skin analysis could not be shown</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        This page hit an unexpected error. Your answers are not lost if the analysis was already saved.
      </p>
      <div className="mt-6 flex gap-3">
        <button type="button" className="ui-btn" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/skin-analysis" className="ui-btn-secondary">
          Back
        </Link>
      </div>
    </div>
  );
}
