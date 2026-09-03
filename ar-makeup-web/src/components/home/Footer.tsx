import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-black/8 bg-[#F4EEE8]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-white/80 ring-1 ring-black/8">
                <div className="h-2 w-2 rounded-full bg-[#B65C7A]" />
              </div>
              <span className="text-[13.5px] font-medium text-[#1a0e13]">
                AR Makeup
              </span>
            </div>
            <p className="mt-4 max-w-[280px] text-xs font-light leading-6 text-[#6a4a55]">
              A virtual makeup try-on web experience for product discovery,
              saved looks, and shareable results — built as a Final Year Project.
            </p>
          </div>

          {/* Explore */}
          <div>
            <p className="text-[10.5px] font-medium tracking-widest text-[#3a1a25]">
              EXPLORE
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {[
                { label: "Products", href: "/products" },
                { label: "Try-On Lite", href: "/try-on" },
                { label: "Skin Analysis", href: "/skin-analysis" },
                { label: "Saved Looks", href: "/my-looks" },
              ].map((x) => (
                <Link
                  key={x.label}
                  href={x.href}
                  className="text-xs font-light text-[#6a4a55] hover:text-[#B65C7A]"
                >
                  {x.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Tech */}
          <div>
            <p className="text-[10.5px] font-medium tracking-widest text-[#3a1a25]">
              BUILT WITH
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              {[
                "Next.js (App Router)",
                "Supabase — Auth & Database",
                "Stripe — Test Checkout",
                "MediaPipe — Mobile AR",
              ].map((t) => (
                <p key={t} className="text-xs font-light text-[#6a4a55]">
                  {t}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-black/8 pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] text-[#9a7a85]">
            © {new Date().getFullYear()} AR Makeup. All rights reserved.
          </p>
          <div className="flex gap-5">
            <Link href="/" className="text-[11px] text-[#9a7a85] hover:text-[#B65C7A]">
              Privacy
            </Link>
            <Link href="/" className="text-[11px] text-[#9a7a85] hover:text-[#B65C7A]">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}