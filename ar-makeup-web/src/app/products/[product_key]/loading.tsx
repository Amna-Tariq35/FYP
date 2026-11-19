import PageLoader from "@/src/components/layout/PageLoader";

export default function ProductDetailLoading() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageLoader label="Loading product details..." className="py-4" />
        <div
          className="mt-6 grid animate-pulse gap-10 md:grid-cols-2"
          aria-hidden="true"
        >
          <div className="aspect-square rounded-2xl bg-black/5" />
          <div className="space-y-5 py-4">
            <div className="h-4 w-24 rounded bg-black/5" />
            <div className="h-9 w-3/4 rounded bg-black/5" />
            <div className="h-6 w-1/3 rounded bg-black/5" />
            <div className="h-24 rounded bg-black/5" />
            <div className="h-12 rounded-xl bg-black/5" />
          </div>
        </div>
      </div>
    </main>
  );
}
