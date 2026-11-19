import Link from "next/link";
import BrandMark from "../layout/BrandMark";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-black/8 bg-[#F4EEE8]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <BrandMark footer />
            <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
              Discover your next favourite look with virtual try-on, thoughtful
              product discovery, and personalised beauty tools.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#3a1a25]">
              EXPLORE
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Products", href: "/products" },
                { label: "Virtual Try-On", href: "/try-on" },
                { label: "Skin Analysis", href: "/skin-analysis" },
                { label: "My Makeup Bag", href: "/makeup-bag" },
              ].map((x) => (
                <Link
                  key={x.label}
                  href={x.href}
                  className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--rose-primary)]"
                >
                  {x.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#3a1a25]">
              HELP & INFORMATION
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Contact & Support", href: "/support" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
              ].map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--rose-primary)]"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-black/8 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} AR Makeup. All rights reserved.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Beauty, thoughtfully discovered.
          </p>
        </div>
      </div>
    </footer>
  );
}
