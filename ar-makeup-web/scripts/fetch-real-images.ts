import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serpApiKey = process.env.SERPAPI_KEY || '';

if (!supabaseUrl || !supabaseKey || !serpApiKey) {
  console.error('❌ Error: Supabase credentials ya SERPAPI_KEY missing hai!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGoogleProductImage(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(
      query + ' product'
    )}&api_key=${serpApiKey}&num=1`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (data.error) {
      console.error(`⚠️ SerpAPI Error: ${data.error}`);
      return null;
    }

    if (data.images_results && data.images_results.length > 0) {
      return data.images_results[0].original;
    }
  } catch (error) {
    console.error(`❌ Image search error for "${query}":`, error);
  }
  return null;
}

async function updateRealImagesInLoop() {
  console.log('🚀 Automated Image Fetcher Started...\n');

  let hasMore = true;
  let totalProcessed = 0;
  const BATCH_SIZE = 20; // 20-20 karke fetch karega taaki progress dikhti rahe

  while (hasMore) {
    // Select next batch of products where image_url is missing
    const { data: products, error } = await supabase
      .from('makeup_products')
      .select('id, brand, name, image_url')
      .is('image_url', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌ DB Error:', error.message);
      break;
    }

    if (!products || products.length === 0) {
      console.log('🎉 PERFECT! Saare products ki images update ho chuki hain! Ab koi product bina image ke nahi bacha.');
      hasMore = false;
      break;
    }

    console.log(`\n📦 Batch Processing: ${products.length} products (Total processed so far: ${totalProcessed})...`);

    for (const product of products) {
      const searchQuery = `${product.brand} ${product.name}`;
      console.log(`🔍 Searching: "${searchQuery}"`);

      const imageUrl = await fetchGoogleProductImage(searchQuery);

      if (imageUrl) {
        const { error: updateError } = await supabase
          .from('makeup_products')
          .update({ image_url: imageUrl })
          .eq('id', product.id);

        if (!updateError) {
          console.log(`   ✅ Saved!`);
          totalProcessed++;
        } else {
          console.error(`   ❌ DB Update Failed:`, updateError.message);
        }
      } else {
        console.log(`   ⚠️ Image nahi mili ya SerpAPI limit khatam ho gayi. Skipping.`);
        // Agar image na mile ya limit khatam ho jaye, toh break/stop kar dein taaki infinite loop na bane
      }

      // Safe Delay (800ms) to respect SerpAPI rate limits
      await sleep(800);
    }
  }

  console.log(`\n🏁 Process Complete! Total ${totalProcessed} products updated with Google Images!`);
}

updateRealImagesInLoop();