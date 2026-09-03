import type { ProductShade } from "./catalog";

export interface SavedLook {
  id: string;
  user_id: string;
  look_name: string;
  preview_image_url: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SavedLookItem {
  id: string;
  look_id: string;
  product_key: string;
  /**
   * NOT NULL in the database, and the app only writes an item row once a shade
   * has been picked (`try_on_screen.dart`), so this is always present. Whether
   * it still *resolves* to a `product_shades` row is a separate question — see
   * `shade` on {@link LookItemWithProduct}.
   */
  shade_key: string;
  intensity: number;
  layer_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  product_key: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  brand: string;
}

export interface LookItemWithProduct extends SavedLookItem {
  /**
   * Null when the product was deleted or de-listed after the look was saved —
   * a saved look outlives the catalog rows it points at.
   */
  product: Product | null;
  /**
   * The actual shade this look used, resolved from `product_shades` via
   * (`product_key`, `shade_key`). Null when the shade row no longer exists —
   * `shade_key` itself is always set, but the catalog can move on beneath it.
   */
  shade: ProductShade | null;
}