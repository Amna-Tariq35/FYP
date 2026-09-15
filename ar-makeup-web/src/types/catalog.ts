export type MakeupProduct = {
  id: string; // Added for React keys
  product_key: string;
  name: string;
  brand: string | null;
  category: string | null;
  main_category: string | null;
  description: string | null;
  image_url: string | null;
  price: number | null;
  is_skin_friendly: boolean | null;
  is_active: boolean | null;
  finish: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  rating_average: number | null;
  review_count: number;
};

export type ProductShade = {
  id: string; // Added for React keys
  shade_key: string;
  product_key: string;
  shade_name: string;
  shade_hex: string | null;
};