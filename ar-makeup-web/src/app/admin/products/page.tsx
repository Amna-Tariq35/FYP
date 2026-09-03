"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Edit, Eye, EyeOff, Filter } from "lucide-react";
import {supabase} from "@/src/lib/supabase/client";



type Product = {
  id: string;
  product_key: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  image_url: string;
  is_active: boolean;
};

export default function AdminProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("makeup_products")
      .select("id, product_key, name, brand, category, price, image_url, is_active")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    setTogglingId(id);
    const newStatus = !currentStatus;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/admin/products/toggle", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ id, is_active: newStatus }),
      });

      const data = await res.json();
      if (data.success) {
        setProducts(products.map(p => p.id === id ? { ...p, is_active: newStatus } : p));
      } else {
        alert("Failed to update status.");
      }
    } catch (error) {
      alert("Network error while updating.");
    } finally {
      setTogglingId(null);
    }
  }

  const categories = ["All", ...Array.from(new Set(products.map(p => p.category)))];
  
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main, #1F1F1F)]">Inventory Management</h1>
          <p className="text-sm text-[var(--text-muted, #8A8A8A)] mt-1">
            Manage your makeup products, stock status, and shades.
          </p>
        </div>
        <button 
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition-all"
          style={{ background: "var(--rose-primary, #C06C84)" }}
          onClick={() => router.push("/admin/products/new")}
        >
          <Plus className="w-4 h-4" />
          Add New Product
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name or brand..." 
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F4C2C2]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="relative min-w-[200px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select 
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F4C2C2] appearance-none bg-white"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-base, #FAF7F5)] border-b border-gray-100">
                <th className="py-4 px-6 text-sm font-semibold text-gray-600">Product</th>
                <th className="py-4 px-6 text-sm font-semibold text-gray-600">Category</th>
                <th className="py-4 px-6 text-sm font-semibold text-gray-600">Price</th>
                <th className="py-4 px-6 text-sm font-semibold text-gray-600">Status (In Stock)</th>
                <th className="py-4 px-6 text-sm font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading inventory...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">No products found.</td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <img 
                          src={product.image_url || "https://picsum.photos/seed/makeup/100/100"} 
                          alt={product.name} 
                          className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                        />
                        <div>
                          <div className="font-semibold text-[var(--text-main, #1F1F1F)]">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.brand}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600 capitalize">{product.category.replace('_', ' ')}</td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-900">${product.price}</td>
                    <td className="py-4 px-6">
                      <button 
                        onClick={() => handleToggleActive(product.id, product.is_active)}
                        disabled={togglingId === product.id}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          product.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                        } ${togglingId === product.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span 
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            product.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className="ml-3 text-xs font-medium text-gray-500">
                        {product.is_active ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button 
                        onClick={() => router.push(`/admin/products/${product.id}`)}
                        className="p-2 text-gray-400 hover:text-[#C06C84] hover:bg-[#F4C2C2] rounded-lg transition-colors inline-flex items-center gap-1"
                        title="Edit Product & Shades"
                      >
                        <Edit className="w-4 h-4" />
                        <span className="text-xs font-medium">Edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}