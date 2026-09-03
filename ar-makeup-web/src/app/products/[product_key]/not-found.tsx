import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Product not found</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          The product you’re looking for doesn’t exist.
        </p>

        <Link
          href="/products"
          className="mt-6 inline-block rounded-xl bg-[var(--rose-primary)] px-4 py-2 text-white"
        >
          Back to products
        </Link>
      </div>
    </main>
  );
}
