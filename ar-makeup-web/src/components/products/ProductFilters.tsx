"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";

export default function ProductFilters({
  categories,
  brands,
}: {
  categories: string[];
  brands: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const currentCategory = searchParams.get("category") || "";
  const currentBrand = searchParams.get("brand") || "";

  useEffect(() => {
    const timer = setTimeout(() => updateParams("q", search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearch("");
    router.push(pathname);
  };

  const hasActiveFilters =
    searchParams.get("q") ||
    searchParams.get("category") ||
    searchParams.get("brand");

  return (
    <div className="space-y-7">

      {/* ── Search ── */}
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          size={13}
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--bg-base)] py-2.5 pl-9 pr-8 text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--rose-primary)]/50 focus:ring-2 focus:ring-[var(--rose-primary)]/10"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X size={12} style={{ color: "var(--text-muted)" }} />
          </button>
        )}
      </div>

      {/* ── Categories ── */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Category
        </p>
        <div className="space-y-0.5">
          <FilterButton
            label="All Categories"
            active={!currentCategory}
            onClick={() => updateParams("category", "")}
          />
          {categories.map((c) => (
            <FilterButton
              key={c}
              label={c}
              active={currentCategory === c}
              onClick={() => updateParams("category", c)}
            />
          ))}
        </div>
      </div>

      {/* ── Brands ── */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Brand
        </p>
        <div
          className="space-y-0.5"
          style={{ maxHeight: 200, overflowY: "auto", paddingRight: 2 }}
        >
          <FilterButton
            label="All Brands"
            active={!currentBrand}
            onClick={() => updateParams("brand", "")}
          />
          {brands.map((b) => (
            <FilterButton
              key={b}
              label={b}
              active={currentBrand === b}
              onClick={() => updateParams("brand", b)}
            />
          ))}
        </div>
      </div>

      {/* ── Clear ── */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--rose-primary)]/40 py-2.5 text-[12.5px] font-medium transition hover:bg-[var(--rose-primary)]/5"
          style={{ color: "var(--rose-primary)" }}
        >
          <X size={13} />
          Clear all filters
        </button>
      )}
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] capitalize transition-all duration-150",
        active
          ? "bg-[var(--rose-primary)]/10 font-semibold text-[var(--rose-primary)]"
          : "font-normal text-[var(--text-muted)] hover:bg-[var(--bg-base)]",
      ].join(" ")}
    >
      {/* active dot indicator */}
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full transition-all"
        style={{
          background: active ? "var(--rose-primary)" : "transparent",
          border: active ? "none" : "1.5px solid var(--border-soft)",
        }}
      />
      {label}
    </button>
  );
}