import Link from "next/link";

export default function BrandMark({ footer = false }: { footer?: boolean }) {
  return (
    <Link href="/" aria-label="AR Makeup Try-On home" className={`group flex w-fit items-center text-[#51243F] ${footer ? "gap-2" : "gap-2"}`}>
      <span className={`brand-face relative isolate block shrink-0 overflow-hidden ${footer ? "h-8 w-6" : "h-10 w-7 sm:h-11 sm:w-[30px]"}`}>
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-current"
          style={{
            mask: "url('/branding/oval-face.png') center / contain no-repeat",
            WebkitMask: "url('/branding/oval-face.png') center / contain no-repeat",
          }}
        />
        <span aria-hidden="true" className="brand-face-shine" />
      </span>
      <span className="flex flex-col items-center font-serif">
        <span className={`${footer ? "text-sm" : "text-lg sm:text-2xl"} font-semibold leading-tight`}>AR Makeup</span>
        <span className={`${footer ? "text-[8px]" : "text-[9px] sm:text-[10px]"} italic tracking-[0.18em]`}>TRY-ON</span>
      </span>
    </Link>
  );
}
