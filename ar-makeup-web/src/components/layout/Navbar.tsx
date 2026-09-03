"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";
import { getCartCount, loadCart } from "@/src/store/cart";
import { useSession } from "@/src/hooks/useSession";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const { status: sessionState } = useSession();

  const isActive = (href: string) => pathname === href;

  useEffect(() => setIsMenuOpen(false), [sessionState]);

  useEffect(() => {
    if (sessionState === "loading") return;

    const updateCount = () => {
      const state = loadCart();
      setCartCount(getCartCount(state));
    };

    updateCount();

    window.addEventListener("cart_updated", updateCount);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "ar_makeup_cart_v1") updateCount();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("cart_updated", updateCount);
      window.removeEventListener("storage", onStorage);
    };
  }, [sessionState]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const navLinks = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/products", label: "Products" },
      { href: "/skin-analysis", label: "Skin Analysis" },
      { href: "/try-on", label: "Try-On Lite" },
    ],
    []
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function handleAccountClick() {
    if (sessionState === "loading") return;
    if (sessionState === "signed_out") {
      router.push("/auth/sign-in");
      return;
    }
    setIsMenuOpen((v) => !v);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#FBF7F4]/55 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white/60 ring-1 ring-black/10 backdrop-blur">
            <div className="h-2 w-2 rounded-full bg-[#B65C7A]" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-[#141414]">
            AR Makeup
          </span>
        </Link>

        {/* Center nav (desktop) */}
        <nav className="hidden md:flex">
          <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/45 p-1 backdrop-blur">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={[
                  "rounded-full px-4 py-2 text-sm transition",
                  isActive(l.href)
                    ? "bg-white/75 text-black shadow-sm"
                    : "text-black/60 hover:bg-white/65 hover:text-black",
                ].join(" ")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link
            href="/makeup-bag"
            className="relative rounded-full p-2 text-black/65 hover:bg-white/60 hover:text-black"
            aria-label="Makeup Bag"
            title="Makeup Bag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 7V6a4 4 0 0 1 8 0v1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M5 9h14l-1.2 10.2A2 2 0 0 1 15.81 21H8.19a2 2 0 0 1-1.99-1.8L5 9Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          {/* 🆕 Favourites Icon */}
          <Link
            href="/account/favourites"
            className="relative rounded-full p-2 text-black/65 hover:bg-white/60 hover:text-black"
            aria-label="Favourites"
            title="Favourites"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </Link>
          {/* Cart */}
          <Link
            href="/cart"
            className="relative rounded-full p-2 text-black/65 hover:bg-white/60 hover:text-black"
            aria-label="Cart"
            title="Cart"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6h15l-2 9H8L6 6Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M6 6 5 3H2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>

            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#B65C7A] px-1 text-[11px] font-semibold text-white">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Account */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={handleAccountClick}
              className="rounded-full p-2 text-black/65 hover:bg-white/60 hover:text-black"
              aria-label="Account"
              title="Account"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M20 21a8 8 0 1 0-16 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {sessionState === "signed_in" && isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-black/10 bg-white/70 shadow-xl backdrop-blur">
                <div className="px-4 py-3 text-xs text-black/55">Account</div>
                <div className="h-px bg-black/10" />
                <Link
                  href="/makeup-bag"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-black/75 hover:bg-black/5 hover:text-black transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="opacity-50">
                    <path d="M6 7h15l-1.5 8H8L6 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M6 7 5 4H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Makeup Bag
                </Link>

                <Link
                  href="/account/favourites"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-black/75 hover:bg-black/5 hover:text-black transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="opacity-50">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  My Favourites
                </Link>

                <Link
                  href="/my-looks"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-black/75 hover:bg-black/5 hover:text-black transition-colors"
                >
                  {/* Sparkle icon for My Looks */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="opacity-50">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  My Looks
                </Link>

                <Link
                  href="/my-orders"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-black/75 hover:bg-black/5 hover:text-black transition-colors"
                >
                  {/* Package/box icon for My Orders */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="opacity-50">
                    <path d="M20 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  My Orders
                </Link>

                <div className="h-px bg-black/10" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-black/75 hover:bg-black/5 hover:text-black transition-colors"
                >
                  {/* Logout icon */}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="opacity-50">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="m16 17 5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="mx-auto max-w-6xl px-4 pb-3 md:hidden">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={[
                "shrink-0 rounded-full border border-black/10 bg-white/55 px-3 py-2 text-xs transition backdrop-blur",
                isActive(l.href)
                  ? "bg-white/80 text-black shadow-sm"
                  : "text-black/60 hover:bg-white/70 hover:text-black",
              ].join(" ")}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}