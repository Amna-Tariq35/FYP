// src/store/checkoutShipping.ts
import type { ShippingInfo } from "@/src/types/order";

const STORAGE_KEY = "ar_makeup_checkout_shipping_v1";

// Default values for form
export const DEFAULT_SHIPPING: ShippingInfo = {
  email: "",
  name: "",
  phone: "",
  address: "",
  city: "",
  country: "Pakistan",
};

function safeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function normalizeShipping(raw: any): ShippingInfo {
  // Accept only known fields, ignore extras
  const email = safeString(raw?.email).trim();
  const name = safeString(raw?.name).trim();
  const phone = safeString(raw?.phone).trim();
  const address = safeString(raw?.address).trim();
  const city = safeString(raw?.city).trim();
  const country = safeString(raw?.country).trim();

  return {
    email,
    name,
    phone,
    address,
    city,
    country: country || "Pakistan",
  };
}

export function loadShippingInfo(): ShippingInfo {
  if (typeof window === "undefined") return DEFAULT_SHIPPING;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHIPPING;

    const parsed = JSON.parse(raw);
    const normalized = normalizeShipping(parsed);

    // Ensure required fields exist (still may be empty strings)
    return { ...DEFAULT_SHIPPING, ...normalized };
  } catch {
    return DEFAULT_SHIPPING;
  }
}

export function saveShippingInfo(info: ShippingInfo) {
  if (typeof window === "undefined") return;

  // normalize before saving
  const normalized = normalizeShipping(info);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage errors (quota/private mode)
  }
}

export function clearShippingInfo() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
