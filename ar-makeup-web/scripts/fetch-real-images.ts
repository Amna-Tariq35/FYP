import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serpApiKey = process.env.SERPAPI_KEY || '';

if (!supabaseUrl || !supabaseKey || !serpApiKey) {
  console.error('Error: Supabase credentials or SERPAPI_KEY are missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAvailableSearches(): Promise<number> {
  const accountUrl = new URL('https://serpapi.com/account.json');
  accountUrl.searchParams.set('api_key', serpApiKey);

  const response = await fetch(accountUrl);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(`SerpAPI account check failed: ${data.error || response.statusText}`);
  }

  const availableSearches = Number(data.total_searches_left);
  if (!Number.isFinite(availableSearches) || availableSearches < 0) {
    throw new Error('SerpAPI did not return a valid remaining-search count.');
  }

  return availableSearches;
}

async function fetchGoogleProductImage(query: string): Promise<string | null> {
  const searchUrl = new URL('https://serpapi.com/search.json');
  searchUrl.searchParams.set('engine', 'google_images');
  searchUrl.searchParams.set('q', `${query} product`);
  searchUrl.searchParams.set('api_key', serpApiKey);
  searchUrl.searchParams.set('num', '1');

  const response = await fetch(searchUrl);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(`SerpAPI image search failed for "${query}": ${data.error || response.statusText}`);
  }

  return data.images_results?.[0]?.original ?? null;
}

async function getProductsWithoutImages() {
  const products = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('makeup_products')
      .select('id, brand, name, image_url')
      .or('image_url.is.null,image_url.eq.')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase product lookup failed: ${error.message}`);
    }

    products.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return products;
}

async function updateRealImages() {
  console.log('Starting product image fetch...\n');

  const [availableSearches, products] = await Promise.all([
    getAvailableSearches(),
    getProductsWithoutImages(),
  ]);

  console.log(`SerpAPI searches remaining: ${availableSearches}`);
  console.log(`Products missing images: ${products.length}`);

  const productsToProcess = products.slice(0, availableSearches);
  if (productsToProcess.length < products.length) {
    console.log(`Quota limit: processing ${productsToProcess.length} of ${products.length} products.`);
  }

  let updated = 0;
  let notFound = 0;
  let updateFailed = 0;
  let searchFailed = 0;
  const DISPLAY_BATCH_SIZE = 20;
  const SEARCH_CONCURRENCY = 4;

  for (let start = 0; start < productsToProcess.length; start += SEARCH_CONCURRENCY) {
    const batch = productsToProcess.slice(start, start + SEARCH_CONCURRENCY);
    if (start % DISPLAY_BATCH_SIZE === 0) {
      console.log(`\nProcessing products ${start + 1}-${Math.min(start + DISPLAY_BATCH_SIZE, productsToProcess.length)} of ${productsToProcess.length}...`);
    }

    const results = await Promise.allSettled(
      batch.map((product) => {
        const searchQuery = `${product.brand} ${product.name}`;
        console.log(`Searching: "${searchQuery}"`);
        return fetchGoogleProductImage(searchQuery);
      })
    );

    let fatalSearchError = false;
    for (let index = 0; index < batch.length; index++) {
      const result = results[index];
      if (result.status === 'rejected') {
        console.error(`   Image search failed for "${batch[index].name}":`, result.reason);
        searchFailed++;
        if (/quota|out of searches|limit exceeded|rate limit|invalid api key|unauthorized/i.test(String(result.reason))) {
          fatalSearchError = true;
        }
        continue;
      }

      if (!result.value) {
        console.log(`   No image found for "${batch[index].name}"; skipping.`);
        notFound++;
      } else {
        const { error } = await supabase
          .from('makeup_products')
          .update({ image_url: result.value })
          .eq('id', batch[index].id);

        if (error) {
          console.error(`   Database update failed for "${batch[index].name}": ${error.message}`);
          updateFailed++;
        } else {
          console.log(`   Image saved for "${batch[index].name}".`);
          updated++;
        }
      }
    }

    if (fatalSearchError) {
      throw new Error('SerpAPI reported a quota, rate-limit, or authorization error; stopping further searches.');
    }

    if (start + SEARCH_CONCURRENCY < productsToProcess.length) {
      await sleep(800);
    }
  }

  console.log('\nImage fetch complete.');
  console.log(`Updated: ${updated}`);
  console.log(`No image found: ${notFound}`);
  console.log(`Image searches failed: ${searchFailed}`);
  console.log(`Database update failed: ${updateFailed}`);
  console.log(`Not searched because of quota: ${products.length - productsToProcess.length}`);
}

updateRealImages().catch((error) => {
  console.error('Image fetch stopped:', error);
  process.exitCode = 1;
});