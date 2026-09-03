"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase/client";

/**
 * Where the bridge is allowed to forward to.
 *
 * The `next` value arrives inside a fragment the user could hand-edit, so it is
 * untrusted input. Forwarding it blindly would be an open redirect — and a
 * particularly bad one, because at that point the session has just been set, so
 * the browser would arrive at the attacker's origin already signed in.
 *
 * Only a same-origin, single-slash path survives. The app applies the identical
 * rule in `WebBridge.normalizeNext`; both sides check, because neither gets to
 * assume the other did.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  const p = raw.trim();

  if (!p.startsWith("/")) return "/";

  // `//evil.com` is protocol-relative — it resolves to a different origin.
  if (p.startsWith("//")) return "/";

  // Browsers normalise backslashes to forward slashes, so `/\evil.com` and
  // `/\/evil.com` are just `//evil.com` wearing a hat. No real path needs one.
  if (p.includes("\\")) return "/";

  // Control characters have no business in a path and are a classic smuggling
  // vector once this string is concatenated into anything.
  if (/[\r\n\t\0]/.test(p)) return "/";

  // Never forward back into the bridge: that would loop, and the second pass
  // would have no tokens.
  if (p === "/auth/bridge" || p.startsWith("/auth/bridge/") || p.startsWith("/auth/bridge?")) {
    return "/";
  }

  return p;
}

type Phase = "working" | "failed";

export default function BridgeClient() {
  const [phase, setPhase] = useState<Phase>("working");
  const [fallback, setFallback] = useState("/");

  // React 19 runs effects twice in development StrictMode. The fragment is
  // consumed and erased on the first pass, so the second would see nothing and
  // report a spurious failure. One-shot guard.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;

      const params = new URLSearchParams(hash);
      const accessToken = params.get("at");
      const refreshToken = params.get("rt");
      const next = safeNext(params.get("next"));
      setFallback(next);

      // Erase the tokens from the address bar and the history entry before
      // anything else runs or any other script gets a chance to read them.
      // `replaceState` (not `pushState`) so there is no entry to go back to.
      window.history.replaceState(null, "", window.location.pathname);

      if (!accessToken || !refreshToken) {
        // Opened directly, or the fragment was stripped somewhere. Not an
        // error worth showing — just send them through the normal front door.
        window.location.replace(`/auth/sign-in?next=${encodeURIComponent(next)}`);
        return;
      }

      try {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) throw error;

        // A hard navigation rather than router.replace(): it guarantees the
        // server sees the freshly-written auth cookie on the very first
        // request, so server components render signed-in with no refresh
        // needed. This runs once per handoff, so the extra load is free.
        window.location.replace(next);
      } catch (err) {
        console.error("[auth/bridge] setSession failed:", err);
        setPhase("failed");
      }
    };

    void run();
  }, []);

  return (
    <div className="relative flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#FAF7F5] px-4">
      {/* Same soft glows as the sign-in screens, so the handoff doesn't look
          like a different website mid-flight. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#F4C2C2]/30 blur-3xl" />
        <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-[#C06C84]/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl border border-black/[0.08] bg-white/78 p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.09)] backdrop-blur-sm">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#C06C84]/20 bg-white/70 px-3.5 py-1.5 text-xs text-[#C06C84]/80 shadow-sm backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C06C84]" />
          AR Makeup
        </div>

        {phase === "working" ? (
          <>
            <div
              className="mx-auto mt-7 h-9 w-9 animate-spin rounded-full border-2 border-[#C06C84]/20 border-t-[#C06C84]"
              role="status"
              aria-label="Signing you in"
            />
            <h1 className="mt-6 text-lg font-semibold tracking-tight text-[#1F1F1F]">
              Signing you in…
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#5A5A5A]">
              Carrying your session over from the app.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-7 text-lg font-semibold tracking-tight text-[#1F1F1F]">
              We couldn&apos;t sign you in
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#5A5A5A]">
              That handoff link has expired. Signing in here takes a second.
            </p>
            <Link
              href={`/auth/sign-in?next=${encodeURIComponent(fallback)}`}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#C06C84] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#a85a70]"
            >
              Sign in
            </Link>
            <Link
              href="/"
              className="mt-3 inline-block text-xs text-black/40 underline-offset-2 transition-colors hover:text-[#C06C84] hover:underline"
            >
              Continue without signing in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
