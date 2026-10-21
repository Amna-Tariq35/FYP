export type CartItem = {
  product_key: string;
  shade_key?: string | null;
  quantity: number;
  selected?: boolean;

  // display fields (Phase 1/2 me product/shade fetch ke baad fill honge)
  name?: string;
  brand?: string;
  shade_name?: string;
  price?: number; // optional (Phase 2 pricing)
  image_url?: string;
  stock_quantity?: number;
};

export type CartState = {
  items: CartItem[];
};

const STORAGE_KEY = "ar_makeup_cart_v1";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CartItem;
  return typeof item.product_key === "string" && item.product_key.length > 0;
}

function withSelectionDefaults(items: CartItem[]): CartItem[] {
  const anyFlag = items.some((item) => typeof item.selected === "boolean");
  if (!anyFlag) {
    const onlyOne = items.length === 1;
    return items.map((item) => ({ ...item, selected: onlyOne }));
  }
  return items.map((item) => ({ ...item, selected: item.selected === true }));
}

// --- Helpers (localStorage) ---
function safeParse(json: string | null): CartState {
  if (!json) return { items: [] };
  try {
    const parsed = JSON.parse(json);
    if (!parsed?.items || !Array.isArray(parsed.items)) return { items: [] };
    return { items: withSelectionDefaults(parsed.items.filter(isCartItem)) };
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

function knownStock(item: { stock_quantity?: number } | undefined, incoming?: number) {
  if (typeof incoming === "number" && Number.isFinite(incoming)) return incoming;
  if (typeof item?.stock_quantity === "number" && Number.isFinite(item.stock_quantity)) {
    return item.stock_quantity;
  }
  return undefined;
}

function capQuantity(quantity: number, stock: number | undefined) {
  if (typeof stock !== "number") return quantity;
  return Math.min(quantity, Math.max(0, Math.floor(stock)));
}

// --- Core ops ---
export function addToCart(newItem: CartItem) {
  const state = loadCart();
  const key = getKey(newItem.product_key, newItem.shade_key);

  const idx = state.items.findIndex(
    (it) => getKey(it.product_key, it.shade_key) === key
  );

  const existing = idx >= 0 ? state.items[idx] : undefined;
  const stock = knownStock(existing, newItem.stock_quantity);
  const nextQty = capQuantity((existing?.quantity || 0) + (newItem.quantity || 1), stock);
  if (nextQty <= 0) return state;

  const { quantity: _quantity, selected: _selected, ...display } = newItem;
  const line: CartItem = {
    ...(existing ?? {}),
    ...display,
    quantity: nextQty,
    selected: true,
    stock_quantity: stock,
  };

  if (idx >= 0) state.items[idx] = line;
  else state.items.push(line);

  state.items = state.items.map((it) => ({
    ...it,
    selected: getKey(it.product_key, it.shade_key) === key,
  }));

  saveCart(state);
  return state;
}

export function updateQuantity(product_key: string, shade_key: string | null, quantity: number) {
  const state = loadCart();
  const key = getKey(product_key, shade_key);

  state.items = state.items
    .map((it) => {
      if (getKey(it.product_key, it.shade_key) !== key) return it;
      return { ...it, quantity: capQuantity(quantity, knownStock(it)) };
    })
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

export function setLineSelected(product_key: string, shade_key: string | null, selected: boolean) {
  const state = loadCart();
  const key = getKey(product_key, shade_key);
  state.items = state.items.map((item) =>
    getKey(item.product_key, item.shade_key) === key ? { ...item, selected } : item,
  );
  saveCart(state);
  return state;
}

export function setAllSelected(selected: boolean) {
  const state = loadCart();
  state.items = state.items.map((item) => ({ ...item, selected }));
  saveCart(state);
  return state;
}

export function selectedCartItems(state?: CartState) {
  const s = state ?? loadCart();
  return s.items.filter((item) => item.selected);
}

/** Drop lines that were purchased. Unchecked lines stay in the cart. */
export function removeOrderedLines(
  lines: Array<{ product_key: string; shade_key?: string | null }>,
) {
  const state = loadCart();
  const keys = new Set(lines.map((line) => getKey(line.product_key, line.shade_key)));
  state.items = state.items.filter((item) => !keys.has(getKey(item.product_key, item.shade_key)));
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

export function getSelectedSubtotal(state?: CartState) {
  return selectedCartItems(state).reduce(
    (sum, it) => sum + (it.price || 0) * (it.quantity || 0),
    0,
  );
}
