// src/types/orders.ts

export type ShippingInfo = {
  // Optional email (guest checkout can provide)
  email?: string;

  name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
};

export type OrderStatus = "draft" | "placed" | "paid" | "failed" | "cancelled";

export type Order = {
  id: string;
  user_id: string | null;
  guest_email: string | null;

  status: OrderStatus;
  currency: string;

  subtotal: number;
  shipping_fee: number;
  total: number;

  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;

  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;

  product_key: string;
  shade_key: string | null;
  shade_name: string | null;

  name: string;
  brand: string | null;
  image_url: string | null;

  unit_price: number;
  quantity: number;
  line_total: number;

  created_at: string;
};

/**
 * API payload types (Phase 2)
 * We will POST this to /api/orders
 */
export type CreateOrderPayload = {
  shipping: ShippingInfo;
  items: Array<{
    product_key: string;
    shade_key?: string | null;
    quantity: number;
    name?: string;
    brand?: string;
    shade_name?: string;
    price?: number;
    image_url?: string;
  }>;
};
