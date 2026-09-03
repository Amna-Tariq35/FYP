"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, MapPin, Package, CreditCard, Clock } from "lucide-react";
import { supabase } from "@/src/lib/supabase/client";
import useSWR from "swr";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  name: string;
  brand: string;
  image_url: string;
  shade_name?: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

interface Order {
  id: string;
  created_at: string;
  status: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  guest_email?: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  currency: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  placed:     "bg-amber-50 text-amber-700 border border-amber-200",
  paid:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
  processing: "bg-blue-50 text-blue-700 border border-blue-200",
  shipped:    "bg-indigo-50 text-indigo-700 border border-indigo-200",
  delivered:  "bg-purple-50 text-purple-700 border border-purple-200",
  cancelled:  "bg-red-50 text-red-600 border border-red-200",
  failed:     "bg-red-50 text-red-600 border border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize tracking-wide ${style}`}>
      {status}
    </span>
  );
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("No active session");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6 max-w-5xl mx-auto pb-12">
      <div className="h-8 bg-gray-100 rounded-xl w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-100 rounded-2xl h-64" />
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-2xl h-40" />
          <div className="bg-gray-100 rounded-2xl h-44" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const { data, error, isLoading } = useSWR(
    orderId ? `/api/admin/orders/${orderId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const order: Order | undefined = data?.order;
  const items: OrderItem[] = data?.items ?? [];

  if (isLoading) return <Skeleton />;

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <Package className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-red-500 font-medium">Order not found or access denied.</p>
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700 transition-colors"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-[#F4C2C2]/40 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Order Details</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
            {order.id}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          {new Date(order.created_at).toLocaleDateString("en-US", {
            day: "numeric", month: "short", year: "numeric",
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column — Items */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-[#F4C2C2]/40 flex items-center justify-center">
                <Package className="w-4 h-4 text-[#C06C84]" />
              </div>
              <h2 className="text-base font-bold text-[var(--text-main)]">
                Purchased Items
                <span className="ml-2 text-xs font-normal text-gray-400">({items.length})</span>
              </h2>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-[#F4C2C2]/60 transition-colors"
                >
                  <img
                    src={item.image_url || "https://picsum.photos/seed/makeup/100/100"}
                    alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover border border-gray-200 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-main)] text-sm leading-tight truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.brand}</p>
                    {item.shade_name && (
                      <span className="mt-1.5 text-xs font-medium text-[#C06C84] bg-[#F4C2C2]/50 inline-flex items-center gap-1 px-2 py-0.5 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C06C84] inline-block" />
                        {item.shade_name}
                      </span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">
                      ${Number(item.unit_price).toFixed(2)} × {item.quantity}
                    </p>
                    <p className="font-bold text-[#C06C84] text-sm mt-0.5">
                      ${Number(item.line_total).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column — Info */}
        <div className="space-y-4">

          {/* Shipping Info */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-[#F4C2C2]/40 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-[#C06C84]" />
              </div>
              <h2 className="text-base font-bold text-[var(--text-main)]">Shipping Info</h2>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-gray-900">{order.shipping_name}</p>
              <p className="text-gray-500">{order.shipping_phone}</p>
              <p className="text-gray-500">{order.guest_email ?? "No email provided"}</p>
              <div className="pt-2 mt-2 border-t border-gray-100 text-gray-400 text-xs leading-relaxed">
                {order.shipping_address}<br />
                {order.shipping_city}, {order.shipping_country}
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-[#F4C2C2]/40 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-[#C06C84]" />
              </div>
              <h2 className="text-base font-bold text-[var(--text-main)]">Payment Summary</h2>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>${Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Shipping</span>
                <span>${Number(order.shipping_fee).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-3 mt-1 border-t border-gray-100">
                <span className="text-[var(--text-main)]">Total</span>
                <span className="text-[#C06C84]">
                  ${Number(order.total).toFixed(2)}{" "}
                  <span className="text-xs font-normal text-gray-400">{order.currency}</span>
                </span>
              </div>

              <div className="pt-4 mt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Order Status</p>
                <StatusBadge status={order.status} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}