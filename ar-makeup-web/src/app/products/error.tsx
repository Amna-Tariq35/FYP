"use client";

export default function Error({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div
          className="
            rounded-2xl border bg-[var(--bg-section)] p-10
            border-[var(--border-soft)]
          "
        >
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            Couldn’t load products
          </h1>
          <p className="mt-2 text-[var(--text-muted)]">
            The makeup collection could not be loaded. Check your connection and try again.
          </p>

          <div className="mt-6">
            <button
              onClick={() => reset()}
              className="
                rounded-xl px-4 py-2 text-white font-medium
                bg-[var(--rose-primary)] hover:opacity-95 transition
              "
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
