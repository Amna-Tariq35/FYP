import type { Metadata } from "next";
import Link from "next/link";

/**
 * Public help page. The Flutter app's Settings → Help Center opens this via
 * `AppConfig.supportPath`, deliberately as a public URL with no session
 * attached — nothing here needs to know who is asking.
 */
export const metadata: Metadata = {
  title: "Help & Support · AR Makeup",
  description:
    "Answers to common questions about virtual try-on, skin analysis, orders and your account.",
};

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How does the virtual try-on work?",
    a: (
      <>
        The app tracks your face in real time and renders makeup onto it live —
        nothing is uploaded to render a look. Shades come from the same catalog
        the store sells from, so what you try on is what you can buy. There is
        also a{" "}
        <Link href="/try-on" className="text-[#C06C84] underline-offset-2 hover:underline">
          lighter try-on
        </Link>{" "}
        here on the website.
      </>
    ),
  },
  {
    q: "Do my saved looks sync between the app and the website?",
    a: (
      <>
        Yes. Saved looks live on your account, so a look created in the app shows
        up under{" "}
        <Link href="/my-looks" className="text-[#C06C84] underline-offset-2 hover:underline">
          My Looks
        </Link>{" "}
        as soon as you are signed in. Opening a look from the app carries your
        session across, so you should not have to sign in twice.
      </>
    ),
  },
  {
    q: "What does the skin analysis do with my photo?",
    a: (
      <>
        Your photo is analysed to estimate skin type and flag visible concerns,
        and the result is saved to your profile so product recommendations can
        use it. Start one from{" "}
        <Link
          href="/skin-analysis"
          className="text-[#C06C84] underline-offset-2 hover:underline"
        >
          Skin Analysis
        </Link>
        . It is a cosmetic aid, not a medical assessment — see a dermatologist
        for anything that concerns you.
      </>
    ),
  },
  {
    q: "Why do I need to sign in?",
    a: "Browsing and trying on are open to everyone. An account is only needed for things tied to you — saved looks, your skin profile, and orders.",
  },
  {
    q: "Where are my orders?",
    a: (
      <>
        Under{" "}
        <Link
          href="/my-orders"
          className="text-[#C06C84] underline-offset-2 hover:underline"
        >
          My Orders
        </Link>
        , with the status of each one. A confirmation email goes out as soon as a
        payment clears.
      </>
    ),
  },
  {
    q: "A shade looks different on me than on screen.",
    a: "Lighting is usually the reason — warm indoor bulbs and phone screens both shift colour. Try again in daylight facing a window. Screens also vary, so treat a swatch as a close guide rather than an exact match.",
  },
];

export default function SupportPage() {
  return (
    <div className="relative min-h-[calc(100vh-72px)] bg-[#FAF7F5]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#F4C2C2]/30 blur-3xl" />
        <div className="absolute -right-24 top-32 h-80 w-80 rounded-full bg-[#C06C84]/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-14">
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#C06C84]/20 bg-white/70 px-3.5 py-1.5 text-xs text-[#C06C84]/80 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C06C84]" />
            Help Center
          </div>

          <h1 className="mt-4 text-[2rem] font-semibold leading-tight tracking-tight text-[#1F1F1F]">
            How can we help?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5A5A5A]">
            The questions we get asked most. If yours isn&apos;t here, the
            chat bubble in the corner can usually help.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-2xl border border-black/[0.08] bg-white/78 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-[#1F1F1F] [&::-webkit-details-marker]:hidden">
                {faq.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 text-[#C06C84]/60 transition-transform group-open:rotate-180"
                >
                  <path
                    d="m6 9 6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-sm leading-6 text-[#5A5A5A]">
                {faq.a}
              </div>
            </details>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-black/[0.08] bg-white/78 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.07)] backdrop-blur-sm">
          <h2 className="text-base font-semibold tracking-tight text-[#1F1F1F]">
            Still stuck?
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5A5A5A]">
            Send us the details and we&apos;ll get back to you. If it&apos;s
            about an order, include the order number.
          </p>
          <a
            href="mailto:support@armakeup.app?subject=Support%20request"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#C06C84] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#a85a70]"
          >
            Email support
          </a>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-black/40">
          <Link href="/products" className="transition-colors hover:text-[#C06C84]">
            Shop products
          </Link>
          <Link href="/my-orders" className="transition-colors hover:text-[#C06C84]">
            My orders
          </Link>
          <Link href="/my-looks" className="transition-colors hover:text-[#C06C84]">
            My looks
          </Link>
        </div>
      </div>
    </div>
  );
}
