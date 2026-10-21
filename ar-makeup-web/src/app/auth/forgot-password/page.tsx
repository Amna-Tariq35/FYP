"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/src/components/layout/AuthShell";
import { supabase } from "@/src/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="We will email you a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#C06C84]/25 bg-[#F4C2C2]/25 px-4 py-3 text-sm text-[#2A2A2A]">
            If an account exists for that email, a reset link is on the way. Open it on this device.
          </div>
          <Link
            href="/auth/sign-in"
            className="block text-center text-sm font-semibold text-[#C06C84] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-black/70 mb-1">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-black/35 shadow-sm focus:border-[#C06C84]/50 focus:ring-4 focus:ring-[#F4C2C2]/35"
              style={{ WebkitTextFillColor: "#000", WebkitBoxShadow: "0 0 0 1000px #fff inset" }}
              required
            />
          </div>

          {msg && (
            <div className="rounded-2xl border border-[#C06C84]/25 bg-[#F4C2C2]/25 px-4 py-3 text-sm text-[#2A2A2A]">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#C06C84] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#C06C84]/15 transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <div className="text-center text-sm">
            <Link
              href="/auth/sign-in"
              className="text-black/60 hover:text-[#C06C84] hover:underline transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
