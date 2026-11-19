export default function PageLoader({
  label = "Loading your page...",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-sm text-[#765966] ${className}`}
    >
      <span
        className="loading-face relative block h-11 w-8 text-[#51243F]"
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 bg-current"
          style={{
            mask: "url('/branding/oval-face.png') center / contain no-repeat",
            WebkitMask: "url('/branding/oval-face.png') center / contain no-repeat",
          }}
        />
      </span>
      <span>{label}</span>
    </div>
  );
}
