import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// .env.local load karo manually
config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role key — full access
);

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID!;

// ── Ek product ke liye Google Image search ──────────────────────────────────
async function fetchProductImage(name: string, brand: string): Promise<string | null> {
  const query = `${brand} ${name} makeup product`;
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_KEY}&num=1&safe=active`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      console.error(`SerpApi error for "${name}":`, data.error);
      return null;
    }

    const imageUrl = data.images_results?.[0]?.original;
    return imageUrl || null;
  } catch (err) {
    console.error(`Fetch failed for "${name}":`, err);
    return null;
  }
}
// ── Delay helper — rate limit se bachne ke liye ─────────────────────────────
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Sab products fetch karo
  const { data: products, error } = await supabase
    .from('makeup_products')
    .select('id, name, brand, image_url');

  if (error || !products) {
    console.error('Supabase fetch error:', error);
    process.exit(1);
  }

  console.log(`Total products: ${products.length}`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const product of products) {
    // Already achhi image hai toh skip karo (optional)
    // if (product.image_url && !product.image_url.includes('openbeautyfacts')) {
    //   skipped++;
    //   continue;
    // }

    console.log(`\n[${updated + failed + skipped + 1}/${products.length}] ${product.brand} - ${product.name}`);

    const imageUrl = await fetchProductImage(product.name, product.brand);

    if (imageUrl) {
      const { error: updateError } = await supabase
        .from('makeup_products')
        .update({ image_url: imageUrl })
        .eq('id', product.id);

      if (updateError) {
        console.error(`  ❌ Update failed:`, updateError.message);
        failed++;
      } else {
        console.log(`  ✅ Updated: ${imageUrl}`);
        updated++;
      }
    } else {
      console.log(`  ⚠️  No image found — skipping`);
      failed++;
    }

    // 1.2 second wait — Google free tier 100 req/day, too fast = error
    await delay(1200);
  }

  console.log(`\n── Done ──`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`⚠️  Failed:  ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
}

main();