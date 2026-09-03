import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div
          className="
            rounded-2xl border bg-[var(--bg-section)] p-10
            border-[var(--border-soft)]
          "
        >
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            Page not found
          </h1>
          <p className="mt-2 text-[var(--text-muted)]">
            The page you’re looking for doesn’t exist.
          </p>

          <Link
            href="/products"
            className="
              mt-6 inline-flex rounded-xl px-4 py-2 text-white font-medium
              bg-[var(--rose-primary)] hover:opacity-95 transition
            "
          >
            Back to products
          </Link>
        </div>
      </div>
    </main>
  );
}
