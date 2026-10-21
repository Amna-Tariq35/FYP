import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getCatalogFacets, getCatalogPage } from "@/src/lib/catalog/queries";
import { defaultCatalogQuery } from "@/src/lib/catalog/list-contract";
import ProductsClient from "@/src/components/products/ProductsClient";

export default async function ProductsPage() {
  const [page, facets, userProfile] = await Promise.all([
    getCatalogPage(defaultCatalogQuery()),
    getCatalogFacets(),
    fetchUserBeautyProfile(),
  ]);

  return (
    <main className="min-h-screen bg-[var(--bg-base)]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-main)] tracking-tight">
            Makeup Collection
          </h1>
          <p className="mt-2 text-[var(--text-muted)] max-w-2xl">
            Browse our exclusive collection of products, explore shades, and find your perfect match.
          </p>
        </div>

        <ProductsClient initialPage={page} facets={facets} userProfile={userProfile} />
      </div>
    </main>
  );
}

async function fetchUserBeautyProfile() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from("user_skin_profiles")
      .select(
        "undertone, depth_level, skin_tone_hex, finish_preference, allergies, skin_type"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    let skinType = !error && data && typeof data.skin_type === "string" ? data.skin_type : null;
    if (!skinType) {
      const log = await supabase
        .from("skin_analysis_logs")
        .select("skin_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!log.error && typeof log.data?.skin_type === "string") skinType = log.data.skin_type;
    }

    if (error && !data) {
      const finishOnly = await supabase
        .from("user_skin_profiles")
        .select("undertone, depth_level, skin_tone_hex, finish_preference, allergies")
        .eq("user_id", user.id)
        .maybeSingle();
      return finishOnly.data ? { ...finishOnly.data, skin_type: skinType } : skinType ? { skin_type: skinType } : null;
    }

    return data ? { ...data, skin_type: skinType } : skinType ? { skin_type: skinType } : null;
  } catch {
    return null;
  }
}
