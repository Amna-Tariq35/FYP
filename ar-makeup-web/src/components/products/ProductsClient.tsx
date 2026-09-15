"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  Tag,
  Layers,
  DollarSign,
  Heart,
  Clock,
} from "lucide-react";
import ProductCard from "./ProductCard";
import { MakeupProduct } from "@/src/types/catalog";
import { useWishlist } from "@/src/hooks/useWishlist";
import { normalizeCategory } from "@/src/lib/catalog/category-taxonomy";

const ITEMS_PER_PAGE = 9;
const RECENTLY_VIEWED_KEY = "fyp_recently_viewed";
const MAX_RECENT = 6;

// ── Recently Viewed Hook ─────────────────────────────────────────────────────
export function useRecentlyViewed(allProducts: MakeupProduct[]) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
      if (stored) setKeys(JSON.parse(stored));
    } catch {}
  }, []);

  const addViewed = useCallback((productKey: string) => {
    setKeys((prev) => {
      const filtered = prev.filter((k) => k !== productKey);
      const next = [productKey, ...filtered].slice(0, MAX_RECENT);
      try { localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const recentProducts = useMemo(
    () =>
      keys
        .map((k) => allProducts.find((p) => p.product_key === k))
        .filter(Boolean) as MakeupProduct[],
    [keys, allProducts]
  );

  return { recentProducts, addViewed };
}

// ── FilterGroup ──────────────────────────────────────────────────────────────
function FilterGroup({
  title,
  icon,
  options,
  selected,
  onChange,
  name,
}: {
  title: string;
  icon: React.ReactNode;
  options: string[];
  selected: string;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <div className="filter-group">
      <div className="filter-group-header">
        {icon}
        <span>{title}</span>
      </div>
      <div className="filter-options-list">
        {options.map((opt) => (
          <label key={opt} className="filter-radio-label">
            <input
              type="radio"
              name={name}
              value={opt}
              checked={selected === opt}
              onChange={(e) => onChange(e.target.value)}
              className="filter-radio-input"
            />
            <span className={`filter-radio-dot ${selected === opt ? "active" : ""}`} />
            <span className={`filter-radio-text ${selected === opt ? "selected" : ""}`}>
              {opt}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── RecentlyViewedStrip ──────────────────────────────────────────────────────
function RecentlyViewedStrip({
  products,
  wishlist,
  onWishlistToggle,
}: {
  products: MakeupProduct[];
  wishlist: string[];
  onWishlistToggle: (k: string) => void;
}) {
  if (products.length === 0) return null;

  return (
    <div className="rv-section">
      <div className="rv-header">
        <Clock className="w-4 h-4" style={{ color: "var(--rose-primary)" }} />
        <span className="rv-title">Recently Viewed</span>
      </div>
      <div className="rv-strip">
        {products.map((p) => {
          const price = typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—";
          const isWished = wishlist.includes(`${p.product_key}__`); // Match new format
          return (
            <a
              key={p.product_key}
              href={`/products/${p.product_key}`}
              className="rv-card"
            >
              <div className="rv-card-body">
                <button
                  className={`rv-heart ${isWished ? "active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onWishlistToggle(p.product_key);
                  }}
                  aria-label="Toggle wishlist"
                >
                  <Heart className="w-3 h-3" />
                </button>
                <p className="rv-brand">{p.brand?.trim() || "—"}</p>
                <p className="rv-name">{p.name}</p>
                <p className="rv-price">{price}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ProductsClient({
  initialProducts,
  userProfile,
}: {
  initialProducts: MakeupProduct[];
  userProfile?: {
    undertone?: string | null;
    depth_level?: string | null;
    skin_tone_hex?: string | null;
    finish_preference?: string | null;
    allergies?: string[] | null;
  } | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [sortBy, setSortBy] = useState("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [selectedFinish, setSelectedFinish] = useState("All");

  // Price range
  const [maxPrice, setMaxPrice] = useState(100);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [minInput, setMinInput] = useState("0");
  const [maxInput, setMaxInput] = useState("100");

  // Hooks
  const { wishlist, toggle: toggleWishlist, isWished, count: wishlistCount } = useWishlist();
  const { recentProducts, addViewed } = useRecentlyViewed(initialProducts);

  useEffect(() => {
    const max = Math.ceil(Math.max(...initialProducts.map((p) => p.price || 0), 1));
    setMaxPrice(max);
    setPriceRange([0, max]);
    setMinInput("0");
    setMaxInput(String(max));
  }, [initialProducts]);

  const handleSliderChange = (newRange: [number, number]) => {
    setPriceRange(newRange);
    setMinInput(String(newRange[0]));
    setMaxInput(String(newRange[1]));
  };

  const commitMin = () => {
    const val = Math.max(0, Math.min(Number(minInput) || 0, priceRange[1] - 1));
    setPriceRange([val, priceRange[1]]);
    setMinInput(String(val));
  };

  const commitMax = () => {
    const val = Math.min(maxPrice, Math.max(Number(maxInput) || maxPrice, priceRange[0] + 1));
    setPriceRange([priceRange[0], val]);
    setMaxInput(String(val));
  };

  const categories = useMemo(() => {
    const cats = new Set(initialProducts.map((p) => normalizeCategory(p.category) || "makeup"));
    return ["All", ...Array.from(cats)].sort();
  }, [initialProducts]);

  const brands = useMemo(() => {
    const brs = new Set(initialProducts.map((p) => p.brand?.trim()).filter(Boolean));
    return ["All", ...Array.from(brs)].sort();
  }, [initialProducts]);

  // Extract unique finish values from products
  const finishes = useMemo(() => {
    const fins = new Set(initialProducts.map((p) => p.finish?.trim()).filter(Boolean));
    return ["All", ...Array.from(fins)].sort();
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...initialProducts];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== "All") {
      result = result.filter((p) => (normalizeCategory(p.category) || "makeup") === normalizeCategory(selectedCategory));
    }

    if (selectedBrand !== "All") {
      result = result.filter((p) => p.brand?.trim() === selectedBrand);
    }

    // Add finish filter
    if (selectedFinish !== "All") {
      result = result.filter((p) => p.finish?.trim() === selectedFinish);
    }

    result = result.filter(
      (p) => (p.price || 0) >= priceRange[0] && (p.price || 0) <= priceRange[1]
    );

    if (sortBy === "price-asc") {
      result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    return result;
  }, [initialProducts, searchQuery, selectedCategory, selectedBrand, sortBy, priceRange]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedCategory, selectedBrand, sortBy, priceRange, selectedFinish]);

  const priceFilterActive = priceRange[0] > 0 || priceRange[1] < maxPrice;
  const activeFiltersCount = [
    selectedCategory !== "All",
    selectedBrand !== "All",
    searchQuery.trim() !== "",
    priceFilterActive,
    selectedFinish !== "All",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
    setSelectedBrand("All");
    setSelectedFinish("All");
    setPriceRange([0, maxPrice]);
    setMinInput("0");
    setMaxInput(String(maxPrice));
  };

  const renderSidebarContent = () => (
    <div className="sidebar-content">
      <div className="filter-group">
        <div className="filter-group-header">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
        </div>
        <div className="search-input-wrapper">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Products, brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="search-clear-btn">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-divider" />

      <div className="filter-group">
        <div className="filter-group-header">
          <DollarSign className="w-3.5 h-3.5" />
          <span>Price Range</span>
          {priceFilterActive && <span className="price-active-dot" title="Filter active" />}
        </div>

        <div className="price-inputs-row">
          <div className="price-input-group">
            <span className="price-input-prefix">$</span>
            <input
              type="number"
              min={0}
              max={maxPrice}
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              onBlur={commitMin}
              onKeyDown={(e) => e.key === "Enter" && commitMin()}
              className="price-input"
              placeholder="Min"
            />
          </div>
          <span className="price-input-sep">—</span>
          <div className="price-input-group">
            <span className="price-input-prefix">$</span>
            <input
              type="number"
              min={0}
              max={maxPrice}
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              onBlur={commitMax}
              onKeyDown={(e) => e.key === "Enter" && commitMax()}
              className="price-input"
              placeholder="Max"
            />
          </div>
        </div>

        <div className="dual-slider-track">
          <div
            className="dual-slider-fill"
            style={{
              left: `${(priceRange[0] / maxPrice) * 100}%`,
              right: `${100 - (priceRange[1] / maxPrice) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={maxPrice}
            value={priceRange[0]}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val < priceRange[1]) handleSliderChange([val, priceRange[1]]);
            }}
            className="dual-slider"
          />
          <input
            type="range"
            min={0}
            max={maxPrice}
            value={priceRange[1]}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (val > priceRange[0]) handleSliderChange([priceRange[0], val]);
            }}
            className="dual-slider"
          />
        </div>
      </div>

      <div className="sidebar-divider" />

      <FilterGroup
        title="Category"
        icon={<Layers className="w-3.5 h-3.5" />}
        options={categories}
        selected={selectedCategory}
        onChange={setSelectedCategory}
        name="category"
      />

      {brands.length > 1 && (
        <>
          <div className="sidebar-divider" />
          <FilterGroup
            title="Brand"
            icon={<Tag className="w-3.5 h-3.5" />}
            options={brands}
            selected={selectedBrand}
            onChange={setSelectedBrand}
            name="brand"
          />
        </>
      )}

      {finishes.length > 1 && (
        <>
          <div className="sidebar-divider" />
          <FilterGroup
            title="Finish"
            icon={<Layers className="w-3.5 h-3.5" />}
            options={finishes}
            selected={selectedFinish}
            onChange={setSelectedFinish}
            name="finish"
          />
          {userProfile?.finish_preference && (
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>
              Your preference: <strong>{userProfile.finish_preference}</strong>
            </div>
          )}
        </>
      )}

      {activeFiltersCount > 0 && (
        <>
          <div className="sidebar-divider" />
          <button onClick={clearAllFilters} className="clear-filters-btn">
            <X className="w-3.5 h-3.5" />
            Clear all filters
            <span className="clear-badge">{activeFiltersCount}</span>
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        /* ── Layout ─────────────────────────────────────────── */
        .products-layout {
          display: flex;
          gap: 28px;
          align-items: flex-start;
          width: 100%;
        }

        /* ── Desktop Sidebar ─────────────────────────────────── */
        .products-sidebar {
          display: none;
          width: 248px;
          flex-shrink: 0;
          position: sticky;
          top: 88px;
          background: var(--bg-section);
          border: 1px solid var(--border-soft);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
        }
        @media (min-width: 1024px) {
          .products-sidebar { display: block; }
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-soft);
          background: var(--bg-base);
        }
        .sidebar-header-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .sidebar-filter-icon { color: var(--rose-primary); }
        .sidebar-badge {
          margin-left: auto;
          background: var(--rose-primary);
          color: white;
          font-size: 10px;
          font-weight: 700;
          border-radius: 99px;
          padding: 1px 7px;
          line-height: 18px;
        }

        .sidebar-content {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* ── Filter Groups ───────────────────────────────────── */
        .filter-group { margin-bottom: 4px; }
        .filter-group-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 10px;
        }
        .price-active-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--rose-primary);
          display: inline-block;
          margin-left: 2px;
          flex-shrink: 0;
        }
        .filter-options-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 200px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .filter-options-list::-webkit-scrollbar { width: 3px; }
        .filter-options-list::-webkit-scrollbar-track { background: transparent; }
        .filter-options-list::-webkit-scrollbar-thumb {
          background: var(--border-soft);
          border-radius: 99px;
        }
        .filter-radio-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 10px;
          transition: background 0.15s;
        }
        .filter-radio-label:hover { background: var(--bg-base); }
        .filter-radio-input { display: none; }
        .filter-radio-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid var(--border-soft);
          flex-shrink: 0;
          position: relative;
          transition: border-color 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .filter-radio-dot.active { border-color: var(--rose-primary); }
        .filter-radio-dot.active::after {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--rose-primary);
          position: absolute;
        }
        .filter-radio-text {
          font-size: 13px;
          color: var(--text-muted);
          transition: color 0.15s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .filter-radio-text.selected {
          color: var(--text-main);
          font-weight: 600;
        }

        /* ── Price Range ─────────────────────────────────────── */
        .price-inputs-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .price-input-group {
          flex: 1;
          display: flex;
          align-items: center;
          border: 1.5px solid var(--border-soft);
          border-radius: 10px;
          background: var(--bg-base);
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .price-input-group:focus-within { border-color: var(--rose-primary); }
        .price-input-prefix {
          padding: 0 6px 0 10px;
          font-size: 12px;
          font-weight: 700;
          color: var(--rose-primary);
          line-height: 1;
          flex-shrink: 0;
        }
        .price-input {
          width: 100%;
          padding: 8px 8px 8px 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
          background: transparent;
          border: none;
          outline: none;
          -moz-appearance: textfield;
        }
        .price-input::-webkit-outer-spin-button,
        .price-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .price-input-sep {
          font-size: 12px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .dual-slider-track {
          position: relative;
          height: 4px;
          background: rgba(0,0,0,0.08);
          border-radius: 99px;
          margin: 4px 0 6px;
        }
        .dual-slider-fill {
          position: absolute;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, var(--rose-soft), var(--rose-primary));
          border-radius: 99px;
          pointer-events: none;
        }
        .dual-slider {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          height: 4px;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          pointer-events: none;
          outline: none;
          margin: 0;
        }
        .dual-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid var(--rose-primary);
          box-shadow: 0 2px 8px rgba(192,108,132,0.35);
          pointer-events: all;
          cursor: grab;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .dual-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 3px 14px rgba(192,108,132,0.45);
        }
        .dual-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.2);
        }
        .dual-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid var(--rose-primary);
          box-shadow: 0 2px 8px rgba(192,108,132,0.35);
          pointer-events: all;
          cursor: grab;
        }

        /* ── Search ──────────────────────────────────────────── */
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon {
          position: absolute;
          left: 11px;
          width: 14px;
          height: 14px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          padding: 9px 36px 9px 34px;
          font-size: 13px;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-base);
          color: var(--text-main);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .search-input::placeholder { color: var(--text-muted); }
        .search-input:focus {
          border-color: var(--rose-primary);
          box-shadow: 0 0 0 3px rgba(192,108,132,0.10);
        }
        .search-clear-btn {
          position: absolute;
          right: 10px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 50%;
          cursor: pointer;
          background: none;
          border: none;
          transition: color 0.15s;
        }
        .search-clear-btn:hover { color: var(--text-main); }

        .sidebar-divider {
          height: 1px;
          background: var(--border-soft);
          margin: 14px 0;
          opacity: 0.7;
        }
        .clear-filters-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--rose-primary);
          background: none;
          border: 1.5px dashed var(--rose-primary);
          cursor: pointer;
          padding: 8px 10px;
          border-radius: 10px;
          width: 100%;
          transition: background 0.15s;
        }
        .clear-filters-btn:hover { background: rgba(192,108,132,0.06); }
        .clear-badge {
          margin-left: auto;
          background: var(--rose-primary);
          color: white;
          font-size: 10px;
          font-weight: 700;
          border-radius: 99px;
          padding: 1px 7px;
          line-height: 17px;
        }

        /* ── Main Content ────────────────────────────────────── */
        .products-main { flex: 1; min-width: 0; }

        /* ── Top Bar ─────────────────────────────────────────── */
        .products-topbar {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
          background: var(--bg-section);
          border: 1px solid var(--border-soft);
          border-radius: 16px;
          padding: 14px 18px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        @media (min-width: 640px) {
          .products-topbar { flex-direction: row; align-items: center; }
        }
        .results-count {
          font-size: 13px;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .results-count strong { font-weight: 700; color: var(--text-main); }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
          width: 100%;
        }
        @media (min-width: 640px) { .topbar-right { width: auto; } }

        /* Wishlist button in topbar - NOW A LINK */
        .wishlist-topbar-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-base);
          color: var(--text-main);
          text-decoration: none;
          white-space: nowrap;
          transition: border-color 0.15s, background 0.15s;
          position: relative;
        }
        .wishlist-topbar-btn:hover {
          border-color: var(--rose-primary);
          background: rgba(192,108,132,0.04);
        }
        .wishlist-topbar-btn .heart-icon {
          color: var(--rose-primary);
          transition: transform 0.2s;
        }
        .wishlist-topbar-btn:hover .heart-icon { transform: scale(1.2); }
        .wishlist-topbar-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: var(--rose-primary);
          color: white;
          font-size: 9px;
          font-weight: 700;
          width: 17px;
          height: 17px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--bg-base);
        }

        .mobile-filter-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-base);
          color: var(--text-main);
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s;
          position: relative;
        }
        .mobile-filter-btn:hover { border-color: var(--rose-primary); }
        @media (min-width: 1024px) { .mobile-filter-btn { display: none; } }
        .mobile-filter-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background: var(--rose-primary);
          color: white;
          font-size: 9px;
          font-weight: 700;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sort-select-wrapper { position: relative; flex: 1; }
        @media (min-width: 640px) { .sort-select-wrapper { flex: 0 0 auto; } }
        .sort-icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          color: var(--text-muted);
          pointer-events: none;
        }
        .sort-select {
          width: 100%;
          padding: 8px 12px 8px 33px;
          font-size: 13px;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-base);
          color: var(--text-main);
          outline: none;
          appearance: none;
          cursor: pointer;
          transition: border-color 0.15s;
          white-space: nowrap;
        }
        .sort-select:focus { border-color: var(--rose-primary); }

        /* ── Products Grid ───────────────────────────────────── */
        .products-grid {
          display: grid;
          gap: 20px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 480px) { .products-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1280px) { .products-grid { grid-template-columns: repeat(3, 1fr); } }

        /* ── Empty State ─────────────────────────────────────── */
        .empty-state {
          border: 1px solid var(--border-soft);
          border-radius: 20px;
          background: var(--bg-section);
          padding: 64px 24px;
          text-align: center;
        }
        .empty-icon-wrap {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(192,108,132,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        .empty-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin-bottom: 6px; }
        .empty-desc {
          font-size: 14px;
          color: var(--text-muted);
          max-width: 340px;
          margin: 0 auto 20px;
          line-height: 1.55;
        }
        .empty-clear-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 22px;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-base);
          color: var(--text-main);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .empty-clear-btn:hover { border-color: var(--rose-primary); background: rgba(192,108,132,0.04); }

        /* ── Pagination ──────────────────────────────────────── */
        .pagination-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 36px;
          padding-top: 24px;
          border-top: 1px solid var(--border-soft);
          flex-wrap: wrap;
        }
        .pagination-arrow {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-section);
          color: var(--text-main);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .pagination-arrow:hover:not(:disabled) { border-color: var(--rose-primary); background: var(--bg-base); }
        .pagination-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
        .pagination-nums { display: flex; align-items: center; gap: 4px; }
        .pagination-num {
          min-width: 38px;
          height: 38px;
          padding: 0 8px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1.5px solid transparent;
          background: none;
          color: var(--text-main);
          transition: all 0.15s;
        }
        .pagination-num:hover:not(.active) { border-color: var(--border-soft); background: var(--bg-section); }
        .pagination-num.active {
          background: var(--rose-primary);
          color: white;
          border-color: var(--rose-primary);
          box-shadow: 0 2px 8px rgba(192,108,132,0.25);
        }
        .pagination-dots { font-size: 13px; color: var(--text-muted); padding: 0 2px; line-height: 38px; }

        /* ── Mobile Filter Drawer ────────────────────────────── */
        .mobile-drawer-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
        }
        @media (min-width: 1024px) { .mobile-drawer-overlay { display: none; } }
        .mobile-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(4px);
        }
        .mobile-drawer {
          position: relative;
          z-index: 61;
          width: 100%;
          max-width: 300px;
          background: var(--bg-section);
          height: 100%;
          overflow-y: auto;
          box-shadow: 4px 0 32px rgba(0,0,0,0.15);
        }
        .mobile-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-soft);
          background: var(--bg-base);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .mobile-drawer-title { font-size: 15px; font-weight: 700; color: var(--text-main); }
        .drawer-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          border: 1.5px solid var(--border-soft);
          background: var(--bg-section);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .drawer-close-btn:hover { color: var(--text-main); border-color: var(--rose-primary); }

        /* ── Recently Viewed ─────────────────────────────────── */
        .rv-section {
          margin-bottom: 28px;
          background: var(--bg-section);
          border: 1px solid var(--border-soft);
          border-radius: 16px;
          padding: 16px 18px 18px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .rv-header {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 14px;
        }
        .rv-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: 0.02em;
        }
        .rv-strip {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: none;
        }
        .rv-strip::-webkit-scrollbar { display: none; }
        .rv-card {
          flex-shrink: 0;
          width: 130px;
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          background: var(--bg-base);
          overflow: hidden;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }
        .rv-card:hover {
          border-color: rgba(192,108,132,0.30);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .rv-card-body { padding: 10px 11px 11px; position: relative; }
        .rv-heart {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid var(--border-soft);
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .rv-heart.active {
          color: var(--rose-primary);
          border-color: rgba(192,108,132,0.35);
          background: rgba(192,108,132,0.08);
        }
        .rv-heart:hover { color: var(--rose-primary); border-color: rgba(192,108,132,0.35); }
        .rv-brand {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 3px;
          padding-right: 24px;
        }
        .rv-name {
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-main);
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .rv-price { font-size: 12px; font-weight: 700; color: var(--rose-primary); }
      `}</style>

      {/* ── Recently Viewed Strip (above main layout) ── */}
      <RecentlyViewedStrip
        products={recentProducts}
        wishlist={wishlist}
        onWishlistToggle={toggleWishlist}
      />

      <div className="products-layout">
        {/* ── Desktop Sidebar ── */}
        <aside className="products-sidebar">
          <div className="sidebar-header">
            <Filter className="w-4 h-4 sidebar-filter-icon" />
            <span className="sidebar-header-title">Filters</span>
            {activeFiltersCount > 0 && (
              <span className="sidebar-badge">{activeFiltersCount}</span>
            )}
          </div>
          {renderSidebarContent()}
        </aside>

        {/* ── Mobile Filter Drawer ── */}
        {isMobileFiltersOpen && (
          <div className="mobile-drawer-overlay">
            <div className="mobile-drawer-backdrop" onClick={() => setIsMobileFiltersOpen(false)} />
            <div className="mobile-drawer">
              <div className="mobile-drawer-header">
                <span className="mobile-drawer-title">Filters</span>
                <button className="drawer-close-btn" onClick={() => setIsMobileFiltersOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderSidebarContent()}
            </div>
          </div>
        )}

        {/* ── Main Content ── */}
        <div className="products-main">
          {/* Top Bar */}
          <div className="products-topbar">
            <span className="results-count">
              Showing <strong>{filteredProducts.length}</strong>{" "}
              {filteredProducts.length === 1 ? "product" : "products"}
            </span>

            <div className="topbar-right">
              {/* Wishlist Button - NOW A LINK */}
              <Link href="/account/favourites" className="wishlist-topbar-btn">
                <Heart
                  className="w-4 h-4 heart-icon"
                  style={wishlistCount > 0 ? { fill: "var(--rose-primary)" } : {}}
                />
                <span className="hidden sm:inline">Wishlist</span>
                {wishlistCount > 0 && (
                  <span className="wishlist-topbar-badge">{wishlistCount}</span>
                )}
              </Link>

              <button
                className="mobile-filter-btn"
                onClick={() => setIsMobileFiltersOpen(true)}
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="mobile-filter-badge">{activeFiltersCount}</span>
                )}
              </button>

              <div className="sort-select-wrapper">
                <SlidersHorizontal className="sort-icon" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="sort-select"
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low → High</option>
                  <option value="price-desc">Price: High → Low</option>
                  <option value="name-asc">Name: A → Z</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grid or Empty State */}
          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <Search className="w-7 h-7" style={{ color: "var(--rose-primary)" }} />
              </div>
              <p className="empty-title">No products found</p>
              <p className="empty-desc">
                Nothing matched your current filters. Try adjusting your search or clearing the filters.
              </p>
              <button className="empty-clear-btn" onClick={clearAllFilters}>
                <X className="w-4 h-4" />
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {paginatedProducts.map((p) => (
                <ProductCard
                  key={p.product_key}
                  product={p}
                  isWished={isWished(p.product_key)}
                  onWishlistToggle={toggleWishlist}
                  onView={addViewed}
                  userFinishPreference={userProfile?.finish_preference}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-row">
              <button
                className="pagination-arrow"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="pagination-nums">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const page = i + 1;
                  const isFirst = page === 1;
                  const isLast = page === totalPages;
                  const isNear = Math.abs(currentPage - page) <= 1;
                  if (!isFirst && !isLast && !isNear) {
                    if (page === 2 || page === totalPages - 1) {
                      return <span key={page} className="pagination-dots">···</span>;
                    }
                    return null;
                  }
                  return (
                    <button
                      key={page}
                      className={`pagination-num ${currentPage === page ? "active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                className="pagination-arrow"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}