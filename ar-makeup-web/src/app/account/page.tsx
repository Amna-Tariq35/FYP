import Link from "next/link";
import { Heart, Repeat2, ShoppingBag } from "lucide-react";

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Your account</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Manage saved products, orders, and replenishment shortcuts.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Link href="/account/repeats" className="rounded-2xl border border-[var(--border-soft)] bg-white p-5 transition hover:border-[#C06C84]/50 hover:shadow-sm">
            <Repeat2 className="text-[#C06C84]" size={22} />
            <h2 className="mt-4 font-semibold text-[var(--text-main)]">Your repeats</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Reorder products from your purchase history.</p>
          </Link>
          <Link href="/account/favourites" className="rounded-2xl border border-[var(--border-soft)] bg-white p-5 transition hover:border-[#C06C84]/50 hover:shadow-sm">
            <Heart className="text-[#C06C84]" size={22} />
            <h2 className="mt-4 font-semibold text-[var(--text-main)]">Favourites</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Open your saved products and shades.</p>
          </Link>
          <Link href="/my-orders" className="rounded-2xl border border-[var(--border-soft)] bg-white p-5 transition hover:border-[#C06C84]/50 hover:shadow-sm">
            <ShoppingBag className="text-[#C06C84]" size={22} />
            <h2 className="mt-4 font-semibold text-[var(--text-main)]">My orders</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Track orders and buy items again.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
