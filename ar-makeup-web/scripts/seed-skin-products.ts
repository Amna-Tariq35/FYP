import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase URL ya Key load nahi ho saki!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface CosmeticRow {
  Label: string;
  Brand: string;
  Name: string;
  Price: string;
  Rank: string;
  Ingredients: string;
  Combination: string;
  Dry: string;
  Normal: string;
  Oily: string;
  Sensitive: string;
}

// Multi-tagging logic so products map to multiple concerns for AM/PM creation
function extractTagsAndConcerns(ingredients: string, label: string): string[] {
  const ingLower = ingredients.toLowerCase();
  const tags: string[] = [label];

  if (ingLower.includes('salicylic') || ingLower.includes('benzoyl') || ingLower.includes('tea tree') || ingLower.includes('zinc')) {
    tags.push('Acne Prone');
  }
  if (ingLower.includes('niacinamide') || ingLower.includes('centella') || ingLower.includes('cica') || ingLower.includes('aloe') || ingLower.includes('green tea')) {
    tags.push('Redness & Soothing');
  }
  if (ingLower.includes('hyaluronic') || ingLower.includes('glycerin') || ingLower.includes('squalane') || ingLower.includes('ceramide')) {
    tags.push('Hydrating');
  }
  if (ingLower.includes('glycolic') || ingLower.includes('lactic') || ingLower.includes('aha') || ingLower.includes('bha') || ingLower.includes('salicylic')) {
    tags.push('Exfoliating / Texture');
  }
  if (ingLower.includes('vitamin c') || ingLower.includes('arbutin') || ingLower.includes('licorice') || ingLower.includes('niacinamide')) {
    tags.push('Dark Spots & Brightening');
  }
  if (ingLower.includes('retinol') || ingLower.includes('peptide') || ingLower.includes('adenosine') || ingLower.includes('collagen')) {
    tags.push('Anti-Aging');
  }

  // Fallback if no specific active is matched
  if (tags.length === 1) {
    tags.push('Daily Care');
  }

  return Array.from(new Set(tags));
}

function getSkinTypes(row: CosmeticRow): string {
  const types: string[] = [];
  if (row.Combination === '1') types.push('Combination');
  if (row.Dry === '1') types.push('Dry');
  if (row.Normal === '1') types.push('Normal');
  if (row.Oily === '1') types.push('Oily');
  if (row.Sensitive === '1') types.push('Sensitive');
  
  return types.length > 0 ? types.join(', ') : 'All Skin Types';
}

function createProductKey(brand: string, name: string): string {
  const cleanStr = `${brand}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleanStr.substring(0, 50);
}

async function seedProducts() {
  console.log('🚀 Full Dataset Process Ho Raha Hai...');

  const csvFilePath = path.join(process.cwd(), 'data', 'cosmetics.csv');
  const productsToInsert: any[] = [];
  const seenKeys = new Set<string>();

  const allowedCategories = ['moisturizer', 'cleanser', 'sunscreen', 'treatment', 'eye cream', 'toner'];

  return new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '')
        })
      )
      .on('data', (row: CosmeticRow) => {
        const rawLabel = (row.Label || '').trim();
        const rawIngredients = (row.Ingredients || '').trim();

        if (!allowedCategories.includes(rawLabel.toLowerCase())) return;
        if (!rawIngredients || rawIngredients.toLowerCase().includes('no ingredients')) return;

        const productKey = createProductKey(row.Brand || 'Brand', row.Name || 'Product');
        if (seenKeys.has(productKey)) return;
        seenKeys.add(productKey);

        const tagsList = extractTagsAndConcerns(rawIngredients, rawLabel);
        const skinTypeStr = getSkinTypes(row);

        productsToInsert.push({
          product_key: productKey,
          name: row.Name,
          brand: row.Brand,
          category: rawLabel,
          price: parseFloat(row.Price) || 20.0,
          currency: 'USD',
          image_url: null,
          is_skin_friendly: true,
          tags: tagsList.join(', '),
          finish: null,
          coverage: null,
          is_active: true,
          description: `${row.Brand} ${row.Name} (${rawLabel}) - Effective for ${tagsList.filter(t => t !== rawLabel).join(', ')}. Suitable for ${skinTypeStr} skin.`,
          ingredients: rawIngredients,
          skin_type: skinTypeStr,
          item_form: rawLabel,
          is_new: false,
          discount_percent: 0
        });
      })
      .on('end', async () => {
        console.log(`📊 Total Skincare Products Extracted: ${productsToInsert.length}`);

        // Upload in batches of 200 for smooth Supabase execution
        const BATCH_SIZE = 200;
        for (let i = 0; i < productsToInsert.length; i += BATCH_SIZE) {
          const batch = productsToInsert.slice(i, i + BATCH_SIZE);
          console.log(`⏳ Uploading batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);

          const { error } = await supabase
            .from('makeup_products')
            .upsert(batch, { onConflict: 'product_key' });

          if (error) {
            console.error('❌ Supabase Upload Error:', error.message);
            reject(error);
            return;
          }
        }

        console.log('\n✅ SUCCESS! Entire Skincare Database Seeded Perfectly!');
        console.log('✨ Ab aapke paas HAR concern aur HAR category ke multiple products mojood hain!');
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ Error reading CSV file:', err);
        reject(err);
      });
  });
}

seedProducts();