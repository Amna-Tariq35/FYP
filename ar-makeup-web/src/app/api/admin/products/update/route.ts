import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/src/lib/adminAuth';
import { notifyRestockAlerts } from '@/src/lib/inventory/restock';
import { isValidCategoryCombination, normalizeCategory } from '@/src/lib/catalog/category-taxonomy';

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

    const mainCategory = normalizeCategory(product.main_category || "makeup");
    const category = normalizeCategory(product.category);
    if (!isValidCategoryCombination(mainCategory, category)) {
      return NextResponse.json({ error: "Category does not belong to the selected department." }, { status: 400 });
    }

    const stockQuantity = Number(product.stock_quantity);
    const lowStockThreshold = Number(product.low_stock_threshold ?? 5);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return NextResponse.json({ error: "Stock quantity must be a non-negative integer." }, { status: 400 });
    }
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      return NextResponse.json({ error: "Low-stock threshold must be a non-negative integer." }, { status: 400 });
    }

    const { data: previousProduct, error: previousProductError } = await supabaseAdmin
      .from('makeup_products')
      .select('product_key,stock_quantity')
      .eq('id', product.id)
      .single();
    if (previousProductError || !previousProduct) {
      return NextResponse.json({ error: "Product was not found." }, { status: 404 });
    }

    // 1. Update Product Details
    const { error: productError } = await supabaseAdmin
      .from('makeup_products')
      .update({
        name: product.name,
        brand: product.brand,
        price: product.price,
        category,
        main_category: mainCategory,
        description: product.description,
        stock_quantity: stockQuantity,
        low_stock_threshold: lowStockThreshold,
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
      const shadesToInsert = newShades.map((shade: {
        shade_key: string;
        shade_name: string;
        shade_hex: string;
        shade_order?: number;
      }) => ({
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

    let restockNotifications = null;
    if (previousProduct.stock_quantity === 0 && stockQuantity > 0) {
      restockNotifications = await notifyRestockAlerts(
        supabaseAdmin,
        previousProduct.product_key,
      );
    }

    return NextResponse.json({ success: true, restockNotifications });
  } catch (error: unknown) {
    console.error("Update Product Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Product update failed." }, { status: 500 });
  }
}