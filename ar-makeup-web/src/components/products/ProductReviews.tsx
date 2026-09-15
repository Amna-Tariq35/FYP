"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  body: string;
  created_at: string;
  verified_purchase: boolean;
  is_mine: boolean;
};

export default function ProductReviews({ productKey }: { productKey: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadReviews() {
    const response = await fetch(`/api/product-reviews?product_key=${encodeURIComponent(productKey)}`);
    const data = await response.json();
    if (response.ok) setReviews(data.reviews ?? []);
    setLoading(false);
  }

  // The request synchronizes this client view with the current product key.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadReviews(); }, [productKey]);

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/product-reviews", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, product_key: productKey, rating, body }),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Could not save review.");
    else {
      setMessage(editingId ? "Review updated." : "Review published.");
      setBody(""); setRating(5); setEditingId(null); await loadReviews();
    }
    setSaving(false);
  }

  async function deleteReview(id: string) {
    const response = await fetch(`/api/product-reviews?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setReviews((current) => current.filter((review) => review.id !== id));
  }

  return (
    <section className="mt-12 border-t border-[var(--border-soft)] pt-10">
      <h2 className="text-2xl font-semibold text-[var(--text-main)]">Customer reviews</h2>
      {message && <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>}
      <form onSubmit={submitReview} className="mt-5 max-w-xl rounded-2xl border border-[var(--border-soft)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--text-main)]">{editingId ? "Edit your review" : "Share your experience"}</p>
        <div className="mt-3 flex gap-1" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`}><Star size={20} className={value <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"} /></button>)}
        </div>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="What did you think?" className="mt-3 min-h-24 w-full rounded-xl border border-[var(--border-soft)] p-3 text-sm outline-none focus:border-[#C06C84]" />
        <button disabled={saving} className="mt-3 rounded-xl bg-[#C06C84] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : editingId ? "Update review" : "Post review"}</button>
      </form>
      <div className="mt-6 space-y-4">
        {!loading && reviews.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No reviews yet. Be the first to review this product after purchase.</p> : null}
        {reviews.map((review) => <article key={review.id} className="rounded-2xl border border-[var(--border-soft)] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={15} className={value <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"} />)}</div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{review.verified_purchase ? <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Verified purchase</span> : null}<span>{new Date(review.created_at).toLocaleDateString()}</span></div>
          </div>
          {review.body ? <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{review.body}</p> : null}
          {review.is_mine && <div className="mt-3 flex gap-3"><button type="button" onClick={() => { setEditingId(review.id); setRating(review.rating); setBody(review.body); }} className="inline-flex items-center gap-1 text-xs text-[#C06C84]"><Pencil size={13} /> Edit</button><button type="button" onClick={() => void deleteReview(review.id)} className="inline-flex items-center gap-1 text-xs text-red-600"><Trash2 size={13} /> Delete</button></div>}
        </article>)}
      </div>
    </section>
  );
}
