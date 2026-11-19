import PageLoader from "@/src/components/layout/PageLoader";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageLoader label="Loading the collection..." className="py-4" />

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-section)]"
            >
              <div className="aspect-[4/3] bg-black/5" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-24 rounded bg-black/5" />
                <div className="h-5 w-44 rounded bg-black/5" />
                <div className="h-4 w-32 rounded bg-black/5" />
                <div className="h-10 w-full rounded-xl bg-black/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
