import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getProducts } from "@/src/lib/catalog/queries";
import ProductsClient from "@/src/components/products/ProductsClient";

export default async function ProductsPage() {
  const [products, userProfile] = await Promise.all([
    getProducts(),
    fetchUserBeautyProfile(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-main)] tracking-tight">
            Makeup Collection
          </h1>
          <p className="mt-2 text-[var(--text-muted)] max-w-2xl">
            Browse our exclusive collection of products, explore shades, and find your perfect match.
          </p>
        </div>

        {/* Client Component */}
        <ProductsClient initialProducts={products} userProfile={userProfile} />
      </div>
    </main>
  );
}

// Fetch user's beauty profile if authenticated
async function fetchUserBeautyProfile() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data } = await supabase
      .from("user_skin_profiles")
      .select(
        "undertone, depth_level, skin_tone_hex, finish_preference, allergies"
      )
      .eq("user_id", user.id)
      .single();

    return data || null;
  } catch {
    return null;
  }
}