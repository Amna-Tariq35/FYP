import Link from "next/link";

export function AdminAccessDenied() {
  return (
    <div
      className="mx-auto max-w-md rounded-2xl border px-8 py-10 text-center"
      style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
    >
      <h1 className="text-[21px] font-semibold text-[var(--text-main)]">You do not have access</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
        This account is signed in, but it is not an admin account.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-xl px-5 py-2.5 text-sm font-medium text-white"
        style={{ background: "var(--rose-primary)" }}
      >
        Back to home
      </Link>
    </div>
  );
}

export default function AdminSignInRequired({ nextPath }: { nextPath: string }) {
  return (
    <div
      className="mx-auto max-w-md rounded-2xl border px-8 py-10 text-center"
      style={{ borderColor: "var(--border-soft)", background: "var(--bg-section)" }}
    >
      <h1 className="text-[21px] font-semibold text-[var(--text-main)]">Admin sign-in required</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Sign in with an admin account to view this page.
      </p>
      <Link
        href={`/auth/sign-in?next=${encodeURIComponent(nextPath)}`}
        className="mt-6 inline-flex rounded-xl px-5 py-2.5 text-sm font-medium text-white"
        style={{ background: "var(--rose-primary)" }}
      >
        Sign in
      </Link>
    </div>
  );
}
