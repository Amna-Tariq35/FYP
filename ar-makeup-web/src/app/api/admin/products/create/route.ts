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
    const { product, initialShades } = await request.json();

    if (!product || !product.name || !product.product_key) {
      return NextResponse.json({ error: "Missing required product fields" }, { status: 400 });
    }

    // 1. Insert Product into makeup_products
    const { data: newProduct, error: productError } = await supabaseAdmin
      .from('makeup_products')
      .insert([{
        product_key: product.product_key,
        name: product.name,
        brand: product.brand,
        category: product.category,
        price: product.price,
        image_url: product.image_url || null,
        description: product.description || "",
        is_active: true
      }])
      .select()
      .single();

    if (productError) throw productError;

    // 2. Insert Initial Shades (if any)
    if (initialShades && initialShades.length > 0) {
      const shadesToInsert = initialShades.map((shade: any, index: number) => ({
        product_key: product.product_key,
        shade_key: shade.shade_key,
        shade_name: shade.shade_name,
        shade_hex: shade.shade_hex,
        shade_order: index + 1,
      }));

      const { error: shadeError } = await supabaseAdmin
        .from('product_shades')
        .insert(shadesToInsert);

      if (shadeError) throw shadeError;
    }

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: any) {
    console.error("Create Product Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}