"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ totalPages, currentPage }: { totalPages: number, currentPage: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex justify-center items-center gap-4 mt-12">
      <button
        disabled={currentPage === 1}
        onClick={() => goToPage(currentPage - 1)}
        className="p-2.5 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-section)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-base)] hover:border-[var(--rose-primary)] transition-all"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      
      <span className="text-sm font-medium text-[var(--text-main)] bg-[var(--bg-section)] px-4 py-2 rounded-xl border border-[var(--border-soft)]">
        Page {currentPage} of {totalPages}
      </span>
      
      <button
        disabled={currentPage === totalPages}
        onClick={() => goToPage(currentPage + 1)}
        className="p-2.5 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-section)] text-[var(--text-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-base)] hover:border-[var(--rose-primary)] transition-all"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}