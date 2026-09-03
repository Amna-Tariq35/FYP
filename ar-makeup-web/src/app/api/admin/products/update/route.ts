import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
   // 1. Sirf ek line mein Admin verify karein!
  const auth = await verifyAdmin(request);
  
  // 2. Agar admin nahi hai toh wahi se error bhej dein
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const { product, newShades, deletedShadeIds } = await request.json();

    if (!product || !product.id) {
      return NextResponse.json({ error: "Product data is missing" }, { status: 400 });
    }

    // 1. Update Product Details
    const { error: productError } = await supabaseAdmin
      .from('makeup_products')
      .update({
        name: product.name,
        brand: product.brand,
        price: product.price,
        category: product.category,
        description: product.description,
      })
      .eq('id', product.id);

    if (productError) throw productError;

    // 2. Delete Removed Shades
    if (deletedShadeIds && deletedShadeIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('product_shades')
        .delete()
        .in('id', deletedShadeIds);
        
      if (deleteError) throw deleteError;
    }

    // 3. Insert New Shades
    if (newShades && newShades.length > 0) {
      // Har naye shade ke sath product_key attach karein
      const shadesToInsert = newShades.map((shade: any) => ({
        product_key: product.product_key,
        shade_key: shade.shade_key,
        shade_name: shade.shade_name,
        shade_hex: shade.shade_hex,
        shade_order: shade.shade_order || 0,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('product_shades')
        .insert(shadesToInsert);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update Product Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}