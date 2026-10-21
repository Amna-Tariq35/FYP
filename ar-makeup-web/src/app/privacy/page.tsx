import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · AR Makeup",
  description: "What this student demo stores, and what it does not.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-[calc(100vh-72px)] bg-[#FAF7F5]">
      <div className="mx-auto max-w-2xl px-4 py-14">
        <p className="text-xs font-medium tracking-wide text-[#C06C84]">Student project demo</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#1F1F1F]">Privacy</h1>
        <div className="mt-6 space-y-4 text-sm leading-6 text-[#5A5A5A]">
          <p>
            AR Makeup is a final-year project demo, not a commercial service. This page describes how the demo behaves. It is not a legal privacy policy.
          </p>
          <p>
            An account stores your email and the password hash Supabase keeps. Orders, the makeup bag, favourites, and saved looks are tied to that account when you are signed in.
          </p>
          <p>
            A skin-analysis photo is sent for the scan and is not stored. The saved result is the skin profile and the routine, not the picture.
          </p>
          <p>
            The phone try-on camera photo stays on the device and is not uploaded. The website skin scan is a separate flow. The website try-on page, if opened, uses the browser camera and does not upload that stream to save a face photo.
          </p>
          <p>
            Checkout uses Stripe in test mode. Card numbers are handled by Stripe, not stored in this app.
          </p>
          <p>
            More answers are on the{" "}
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
