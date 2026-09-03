"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import AuthShell from "@/src/components/layout/AuthShell";
import { supabase } from "@/src/lib/supabase/client";

export default function SignUpPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // SSR guard: window is not available during server-side rendering.
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/`
            : undefined,
      },
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setSuccess(true);
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Sign up to save looks and continue checkout anytime."
    >
      {!success ? (
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Email */}
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
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-black/35 focus:border-[#C06C84]/40 focus:ring-4 focus:ring-[#F4C2C2]/30"
              style={{ WebkitTextFillColor: "#000", WebkitBoxShadow: "0 0 0 1000px #fff inset" }}
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-black/70 mb-1">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Create a strong password"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-black/35 focus:border-[#C06C84]/40 focus:ring-4 focus:ring-[#F4C2C2]/30"
              style={{ WebkitTextFillColor: "#000", WebkitBoxShadow: "0 0 0 1000px #fff inset" }}
              required
            />
            <p className="mt-1.5 text-xs text-black/50">
              Use at least 8 characters.
            </p>
          </div>

          {/* Error message */}
          {msg && (
            <div className="rounded-2xl border border-[#C06C84]/25 bg-[#F4C2C2]/25 px-4 py-3 text-sm text-black/70">
              {msg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#C06C84] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          {/* Secondary links */}
          <div className="flex items-center justify-between text-xs text-black/55">
            <Link
              href="/"
              className="hover:text-[#C06C84] hover:underline transition-colors"
            >
              Back to home
            </Link>
            <Link
              href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
              className="font-medium text-[#C06C84] hover:underline"
            >
              Sign in
            </Link>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-4 text-sm text-black/70">
            ✅ Account created. Please check your email for a confirmation link.
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(`/auth/sign-in?next=${encodeURIComponent(next)}`)
            }
            className="w-full rounded-2xl bg-[#C06C84] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            Continue to Sign in
          </button>

          <p className="text-xs text-black/50">
            If you don&apos;t see the email, check Spam or Promotions. It can
            sometimes take a minute.
          </p>
        </div>
      )}
    </AuthShell>
  );
}