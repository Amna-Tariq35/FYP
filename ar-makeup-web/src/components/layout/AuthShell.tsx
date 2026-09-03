import Link from "next/link";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[calc(100vh-72px)] bg-[#FAF7F5]">
      {/* Soft background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#F4C2C2]/30 blur-3xl" />
        <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#C06C84]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-[#F9E4E8]/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl items-center justify-center px-4 py-14">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-6 text-center">
            {/* Brand pill */}
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#C06C84]/20 bg-white/70 px-3.5 py-1.5 text-xs text-[#C06C84]/80 backdrop-blur shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C06C84]" />
              AR Makeup
            </div>

            <h1 className="mt-4 text-[2rem] font-semibold tracking-tight text-[#1F1F1F] leading-tight">
              {title}
            </h1>

            {subtitle ? (
              <p className="mt-2 text-sm leading-6 text-[#5A5A5A]">
                {subtitle}
              </p>
            ) : null}
          </div>

          {/* Card */}
          <div className="rounded-3xl border border-black/[0.08] bg-white/78 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.09)] backdrop-blur-sm md:p-8">
            {children}
          </div>

          {/* Footer note */}
          <p className="mt-5 text-center text-xs text-black/40 leading-5">
            By continuing, you agree to our{" "}
            <Link href="/" className="text-[#C06C84]/80 hover:text-[#C06C84] underline-offset-2 hover:underline transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/" className="text-[#C06C84]/80 hover:text-[#C06C84] underline-offset-2 hover:underline transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}