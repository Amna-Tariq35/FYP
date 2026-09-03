import Link from "next/link";
import MyOrdersClient from "@/src/components/orders/MyOrdersClient";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-3xl border border-[#E6D6D9] bg-white p-10 text-center shadow-sm">
            <h1 className="text-3xl font-semibold text-[var(--text-main)]">My Orders</h1>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Please sign in to view your order history and track the latest status.
            </p>
            <Link
              href="/auth/sign-in?next=/my-orders"
              className="ui-btn mt-8 inline-flex"
            >
              Sign in to continue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pageSize = 10;
  const { data, count, error } = await supabase
    .from("orders")
    .select(
      "id,status,currency,total,subtotal,shipping_fee,created_at,shipping_name,shipping_city",
      { count: "exact" }
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(0, pageSize - 1);

  const orders = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const initialData = error
    ? null
    : {
        orders,
        page: 1,
        pageSize,
        total,
        totalPages,
      };

  if (error) {
    console.error("Failed to load initial orders:", error);
  }

  return <MyOrdersClient initialData={initialData} />;
}
