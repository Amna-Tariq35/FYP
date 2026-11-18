export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-sm text-[#765966]"
    >
      <span className="loading-face relative block h-11 w-8 text-[#51243F]" aria-hidden="true">
        <span
          className="absolute inset-0 bg-current"
          style={{
            mask: "url('/branding/oval-face.png') center / contain no-repeat",
            WebkitMask: "url('/branding/oval-face.png') center / contain no-repeat",
          }}
        />
      </span>
      <span>Loading your page…</span>
    </main>
  );
}
