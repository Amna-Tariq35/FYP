export default function MobileCTA() {
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#1a0e13] p-8 sm:p-10">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#B65C7A]/15 blur-3xl" />

      {/* Top row */}
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#B65C7A]/30 bg-[#B65C7A]/10 px-3 py-1 text-[10.5px] tracking-widest text-[#E7A6B4]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B65C7A]" />
            MOBILE APP
          </div>
          <h3 className="text-[17px] font-medium text-white">
            Full AR experience on mobile
          </h3>
          <p className="mt-2.5 text-[12.5px] font-light leading-7 text-white/55">
            Real-time face landmark detection and live makeup rendering runs on
            the mobile app. The web focuses on catalog browsing, Try-On Lite,
            saved looks, and checkout.
          </p>
        </div>

        {/* Pills */}
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[11.5px] text-white/60">
            <span className="text-white/85">Mobile</span> — Real-time AR
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[11.5px] text-white/60">
            <span className="text-white/85">Web</span> — Catalog + Looks
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative mt-7 h-px w-full bg-white/8" />

      {/* Spec cards */}
      <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { k: "Landmark engine", v: "MediaPipe" },
          { k: "Latency target", v: "≤ 150 ms" },
          { k: "Sync layer", v: "Supabase" },
        ].map((x) => (
          <div
            key={x.k}
            className="rounded-2xl border border-white/8 bg-white/4 p-4"
          >
            <p className="text-[10.5px] font-light tracking-wide text-white/40">
              {x.k}
            </p>
            <p className="mt-1 text-[13px] font-medium text-white/85">{x.v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}