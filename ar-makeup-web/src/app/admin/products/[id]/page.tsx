"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Plus, Trash2, Palette, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/src/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  product_key: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image_url?: string;
}

interface ExistingShade {
  id: string;
  product_key: string;
  shade_name: string;
  shade_hex: string;
  shade_key: string;
  shade_order: number;
}

interface NewShade {
  temp_id: string;
  shade_key: string;
  shade_name: string;
  shade_hex: string;
  shade_order: number;
}

type NotificationType = { message: string; type: "success" | "error" } | null;

const CATEGORIES = [
  "lipstick",
  "foundation",
  "blush",
  "eyeshadow",
  "eyeliner",
] as const;

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ notification }: { notification: NotificationType }) {
  if (!notification) return null;
  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium border transition-all duration-300 ${
        notification.type === "success"
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {notification.type === "success" ? (
        <CheckCircle className="w-4 h-4 text-emerald-500" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400" />
      )}
      {notification.message}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<NotificationType>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [existingShades, setExistingShades] = useState<ExistingShade[]>([]);
  const [newShades, setNewShades] = useState<NewShade[]>([]);
  const [deletedShadeIds, setDeletedShadeIds] = useState<string[]>([]);

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  useEffect(() => {
    if (productId) fetchProductData();
  }, [productId]);

  async function fetchProductData() {
    setLoading(true);

    const { data: prodData, error: prodError } = await supabase
      .from("makeup_products")
      .select("*")
      .eq("id", productId)
      .single();

    if (prodError || !prodData) {
      showNotification("Failed to load product data.", "error");
      setLoading(false);
      return;
    }

    setProduct(prodData);

    const { data: shadeData } = await supabase
      .from("product_shades")
      .select("*")
      .eq("product_key", prodData.product_key)
      .order("shade_order", { ascending: true });

    if (shadeData) setExistingShades(shadeData);
    setLoading(false);
  }

  const handleAddNewShade = () => {
    setNewShades((prev) => [
      ...prev,
      {
        temp_id: Date.now().toString(),
        shade_key: `shade_${Date.now()}`,
        shade_name: "New Shade",
        shade_hex: "#C06C84",
        shade_order: existingShades.length + prev.length + 1,
      },
    ]);
  };

  const handleDeleteExistingShade = (id: string) => {
    setDeletedShadeIds((prev) => [...prev, id]);
    setExistingShades((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteNewShade = (temp_id: string) => {
    setNewShades((prev) => prev.filter((s) => s.temp_id !== temp_id));
  };

  const handleUpdateExistingShade = (
    id: string,
    field: keyof Pick<ExistingShade, "shade_name" | "shade_hex">,
    value: string
  ) => {
    setExistingShades((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleUpdateNewShade = (
    temp_id: string,
    field: keyof Pick<NewShade, "shade_name" | "shade_hex">,
    value: string
  ) => {
    setNewShades((prev) =>
      prev.map((s) => {
        if (s.temp_id !== temp_id) return s;
        const updated = { ...s, [field]: value };
        if (field === "shade_name") {
          updated.shade_key = value.toLowerCase().replace(/\s+/g, "_");
        }
        return updated;
      })
    );
  };

  const handleSave = async () => {
    if (!product) return;
    if (!product.name.trim() || !product.brand.trim()) {
      showNotification("Product name and brand are required.", "error");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/admin/products/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ product, newShades, deletedShadeIds, updatedShades: existingShades }),
      });

      const result = await res.json();
      if (result.success) {
        showNotification("Product updated successfully!", "success");
        setTimeout(() => router.push("/admin/products"), 1200);
      } else {
        showNotification(result.error || "Failed to update product.", "error");
      }
    } catch {
      showNotification("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading Skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse space-y-6 max-w-4xl mx-auto pb-12">
        <div className="h-8 bg-gray-100 rounded-xl w-48" />
        <div className="bg-gray-100 rounded-2xl h-64" />
        <div className="bg-gray-100 rounded-2xl h-48" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <p className="text-sm text-red-500 font-medium">Product not found.</p>
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <Toast notification={notification} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-[#F4C2C2]/40 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">
              Edit Product
            </h1>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {product.product_key}
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all disabled:opacity-60 shadow-sm hover:shadow-md"
          style={{ background: "var(--rose-primary, #C06C84)" }}
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Basic Info */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-[var(--text-main)] pb-3 border-b border-gray-100">
          Basic Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Product Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] transition-shadow"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Brand <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={product.brand}
              onChange={(e) =>
                setProduct({ ...product, brand: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] transition-shadow"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Price (USD) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                $
              </span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={product.price}
                onChange={(e) =>
                  setProduct({
                    ...product,
                    price: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] transition-shadow"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <select
              value={product.category}
              onChange={(e) =>
                setProduct({ ...product, category: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] bg-white capitalize transition-shadow"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Image URL */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Image URL
            </label>
            <input
              type="url"
              value={product.image_url ?? ""}
              placeholder="https://example.com/product.jpg"
              onChange={(e) =>
                setProduct({ ...product, image_url: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] transition-shadow"
            />
          </div>
        </div>

        {/* Image Preview */}
        {product.image_url && (
          <div className="flex items-center gap-4 pt-2">
            <img
              src={product.image_url}
              alt="Product preview"
              className="w-16 h-16 rounded-xl object-cover border border-gray-200"
            />
            <p className="text-xs text-gray-400">Image preview</p>
          </div>
        )}
      </div>

      {/* Shades Management */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#F4C2C2]/40 flex items-center justify-center">
              <Palette className="w-4 h-4 text-[#C06C84]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)]">
                Shades & Colors
              </h2>
              <p className="text-xs text-gray-400">
                Used by the AR engine to render makeup on the user's face.
              </p>
            </div>
          </div>
          <button
            onClick={handleAddNewShade}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[#C06C84] bg-[#F4C2C2]/50 hover:bg-[#F4C2C2]/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Shade
          </button>
        </div>

        <div className="space-y-3">
          {/* Existing Shades */}
          {existingShades.map((shade) => (
            <div
              key={shade.id}
              className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50 hover:border-[#F4C2C2]/50 transition-colors"
            >
              {/* Color Picker */}
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0 cursor-pointer">
                <input
                  type="color"
                  value={shade.shade_hex}
                  onChange={(e) =>
                    handleUpdateExistingShade(shade.id, "shade_hex", e.target.value)
                  }
                  className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                  title="Click to change color"
                />
              </div>

              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Shade Name
                  </label>
                  <input
                    type="text"
                    value={shade.shade_name}
                    onChange={(e) =>
                      handleUpdateExistingShade(
                        shade.id,
                        "shade_name",
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F4C2C2]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Hex Code
                  </label>
                  <input
                    type="text"
                    value={shade.shade_hex.toUpperCase()}
                    readOnly
                    className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-gray-200 bg-white text-gray-500"
                  />
                </div>
              </div>

              <button
                onClick={() => handleDeleteExistingShade(shade.id)}
                className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove shade"
                aria-label="Remove shade"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* New Shades */}
          {newShades.map((shade) => (
            <div
              key={shade.temp_id}
              className="flex items-center gap-4 p-4 border border-[#F4C2C2]/60 rounded-xl bg-[#F4C2C2]/5 shadow-sm"
            >
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                <input
                  type="color"
                  value={shade.shade_hex}
                  onChange={(e) =>
                    handleUpdateNewShade(shade.temp_id, "shade_hex", e.target.value)
                  }
                  className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                />
              </div>

              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Shade Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ruby Red"
                    value={shade.shade_name}
                    onChange={(e) =>
                      handleUpdateNewShade(shade.temp_id, "shade_name", e.target.value)
                    }
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F4C2C2]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    Hex Code
                  </label>
                  <input
                    type="text"
                    value={shade.shade_hex.toUpperCase()}
                    readOnly
                    className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-gray-200 bg-white text-gray-400"
                  />
                </div>
              </div>

              <button
                onClick={() => handleDeleteNewShade(shade.temp_id)}
                className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove shade"
                aria-label="Remove new shade"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {existingShades.length === 0 && newShades.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
              No shades yet. Click{" "}
              <span className="text-[#C06C84] font-medium">Add Shade</span> to
              create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}