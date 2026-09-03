import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero_model.png"
          alt="AR Makeup hero"
          fill
          priority
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FBF7F4]/98 via-[#FBF7F4]/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FBF7F4]/60 via-transparent to-transparent" />
        {/* Subtle rose glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(231,166,180,0.15),transparent_65%)]" />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-lg">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B65C7A]/20 bg-white/60 px-4 py-1.5 text-[11px] tracking-wide text-[#7a4a5a] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E7A6B4]" />
            AR Makeup &nbsp;·&nbsp; Web Experience
          </div>

          {/* Headline */}
          <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.08] tracking-tight text-[#1a0e13] sm:text-6xl">
            AR Makeup,{" "}
            <span className="italic text-[#B65C7A]">beautifully</span>{" "}
            simple.
          </h1>

          {/* Subtext */}
          <p className="mt-5 text-sm font-light leading-7 text-[#5a4048] sm:text-[15px]">
            Try shades, browse products, and open shared looks — in a clean,
            elegant web experience.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/try-on"
              className="inline-flex items-center justify-center rounded-2xl bg-[#B65C7A] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#A94E6C]"
            >
              Try-On Lite
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white/65 px-6 py-3 text-sm font-medium text-[#1a0e13] backdrop-blur transition hover:bg-white/85"
            >
              Browse Products
            </Link>
          </div>

          <p className="mt-5 text-[11px] tracking-wide text-[#9a7a85]">
            Full real-time AR is available on mobile.
          </p>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="relative h-12 bg-gradient-to-b from-transparent to-[#FBF7F4]" />
    </section>
  );
}