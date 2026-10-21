import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms · AR Makeup",
  description: "Plain terms for this student project demo.",
};

export default function TermsPage() {
  return (
    <main className="min-h-[calc(100vh-72px)] bg-[#FAF7F5]">
      <div className="mx-auto max-w-2xl px-4 py-14">
        <p className="text-xs font-medium tracking-wide text-[#C06C84]">Student project demo</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#1F1F1F]">Terms</h1>
        <div className="mt-6 space-y-4 text-sm leading-6 text-[#5A5A5A]">
          <p>
            AR Makeup is a student project for demonstration. It is not a shop you should rely on for real purchases, medical advice, or a guaranteed colour match.
          </p>
          <p>
            Shade try-on and skin analysis are cosmetic guides. Skin photos are not stored. See a dermatologist for skin symptoms.
          </p>
          <p>
            Payments run through Stripe test mode. A successful test payment is not a real charge to a live card, and orders can be cancelled while they are still unpaid.
          </p>
          <p>
            Catalog photos, product names, and prices are demo data. They may not match a product you can buy elsewhere.
          </p>
          <p>
            Questions about how the demo works are on the{" "}
            <Link href="/support" className="text-[#C06C84] underline-offset-2 hover:underline">
              help page
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
