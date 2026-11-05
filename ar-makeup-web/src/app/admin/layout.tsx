"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Package, ShoppingCart, LogOut } from "lucide-react";
import { supabase } from "@/src/lib/supabase/client";
import AdminSignInRequired, { AdminAccessDenied } from "@/src/components/admin/AdminSignInRequired";

const ADMIN_EMAIL = "admin@makeup.com";

type Access = "checking" | "signed-out" | "forbidden" | "admin";

function accessForEmail(email: string | null | undefined): Access {
  if (!email) return "signed-out";
  if (email !== ADMIN_EMAIL) return "forbidden";
  return "admin";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<Access>("checking");

  useEffect(() => {
    let active = true;

    async function checkAdminAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setAccess(accessForEmail(session?.user?.email));
    }

    checkAdminAccess();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAccess(accessForEmail(session?.user?.email));
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (access === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Checking Admin Access...
      </div>
    );
  }

  if (access === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <AdminSignInRequired nextPath={pathname || "/admin"} />
      </div>
    );
  }

  if (access === "forbidden") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <AdminAccessDenied />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-[var(--rose-primary)]">Admin Panel</h2>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link 
            href="/admin" 
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              pathname === '/admin' 
                ? 'bg-[#F4C2C2] text-[var(--rose-primary)] font-medium' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" /> Dashboard
          </Link>
          
          <Link 
            href="/admin/products" 
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              pathname?.includes('/admin/products') 
                ? 'bg-[#F4C2C2] text-[var(--rose-primary)] font-medium' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Package className="w-5 h-5" /> Products
          </Link>
          
          <Link 
            href="/admin/orders" 
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              pathname?.includes('/admin/orders') 
                ? 'bg-[#F4C2C2] text-[var(--rose-primary)] font-medium' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ShoppingCart className="w-5 h-5" /> Orders
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout} 
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-red-500 hover:bg-red-50 transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
