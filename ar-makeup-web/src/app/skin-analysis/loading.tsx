import PageLoader from "@/src/components/layout/PageLoader";

export default function SkinAnalysisLoading() {
  return (
    <main className="min-h-[50vh]">
      <PageLoader label="Loading your skin profile..." className="min-h-[50vh]" />
    </main>
  );
}
