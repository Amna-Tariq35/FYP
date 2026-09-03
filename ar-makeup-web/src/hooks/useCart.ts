"use client";

import { useEffect, useState } from "react";
import {
  loadCart,
  addToCart,
  updateQuantity,
  removeFromCart,
  getCartCount,
  getCartSubtotal,
  CartItem,
} from "@/src/store/cart";

export function useCart() {
  const [state, setState] = useState(loadCart());

  useEffect(() => {
    setState(loadCart());
  }, []);

  function add(item: CartItem) {
    const s = addToCart(item);
    setState(s);
  }

  function update(product_key: string, shade_key: string | null, qty: number) {
    const s = updateQuantity(product_key, shade_key, qty);
    setState(s);
  }

  function remove(product_key: string, shade_key: string | null) {
    const s = removeFromCart(product_key, shade_key);
    setState(s);
  }

  return {
    items: state.items,
    count: getCartCount(state),
    subtotal: getCartSubtotal(state),
    add,
    update,
    remove,
  };
}
