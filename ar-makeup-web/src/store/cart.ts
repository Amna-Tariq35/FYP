export type CartItem = {
  product_key: string;
  shade_key?: string | null;
  quantity: number;

  // display fields (Phase 1/2 me product/shade fetch ke baad fill honge)
  name?: string;
  brand?: string;
  shade_name?: string;
  price?: number; // optional (Phase 2 pricing)
  image_url?: string;
};

export type CartState = {
  items: CartItem[];
};

const STORAGE_KEY = "ar_makeup_cart_v1";

// --- Helpers (localStorage) ---
function safeParse(json: string | null): CartState {
  if (!json) return { items: [] };
  try {
    const parsed = JSON.parse(json);
    if (!parsed?.items || !Array.isArray(parsed.items)) return { items: [] };
    return parsed as CartState;
  } catch {
    return { items: [] };
  }
}

export function loadCart(): CartState {
  if (typeof window === "undefined") return { items: [] };
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveCart(state: CartState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("cart_updated")); // ✅ navbar/cart page refresh
}

export function clearCart() {
  saveCart({ items: [] });
}

function getKey(product_key: string, shade_key?: string | null) {
  return `${product_key}__${shade_key ?? "no-shade"}`;
}

// --- Core ops ---
export function addToCart(newItem: CartItem) {
  const state = loadCart();
  const key = getKey(newItem.product_key, newItem.shade_key);

  const idx = state.items.findIndex(
    (it) => getKey(it.product_key, it.shade_key) === key
  );

  if (idx >= 0) {
    state.items[idx] = {
      ...state.items[idx],
      quantity: state.items[idx].quantity + (newItem.quantity || 1),
      // prefer latest display fields if provided
      ...newItem,
    };
  } else {
    state.items.push({ ...newItem, quantity: newItem.quantity || 1 });
  }

  saveCart(state);
  return state;
}

export function updateQuantity(product_key: string, shade_key: string | null, quantity: number) {
  const state = loadCart();
  const key = getKey(product_key, shade_key);

  state.items = state.items
    .map((it) =>
      getKey(it.product_key, it.shade_key) === key ? { ...it, quantity } : it
    )
    .filter((it) => it.quantity > 0);

  saveCart(state);
  return state;
}

export function removeFromCart(product_key: string, shade_key: string | null) {
  const state = loadCart();
  const key = getKey(product_key, shade_key);

  state.items = state.items.filter(
    (it) => getKey(it.product_key, it.shade_key) !== key
  );

  saveCart(state);
  return state;
}

// --- Derived totals ---
export function getCartCount(state?: CartState) {
  const s = state ?? loadCart();
  return s.items.reduce((sum, it) => sum + (it.quantity || 0), 0);
}

export function getCartSubtotal(state?: CartState) {
  const s = state ?? loadCart();
  return s.items.reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 0), 0);
}
