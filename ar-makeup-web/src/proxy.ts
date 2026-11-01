import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16.1 catches notFound() inside the segment boundary and still
 * responds HTTP 200. These checks run first and return a real 404.
 * A failed or timed-out lookup falls through so a live row is not hidden
 * by an outage.
 */

const LOOKUP_TIMEOUT_MS = 4000;

function withFailOpen(work: () => Promise<NextResponse>): Promise<NextResponse> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(NextResponse.next()), LOOKUP_TIMEOUT_MS);
    work().then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      () => {
        clearTimeout(timer);
        resolve(NextResponse.next());
      },
    );
  });
}

function lastSegment(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const raw = parts[parts.length - 1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function missingPage(title: string, message: string, href: string, hrefLabel: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:Georgia,serif;background:#FBF7F4;color:#1A1A1A;margin:0"><main style="max-width:36rem;margin:4rem auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.5rem">${title}</h1><p>${message}</p><p><a href="${href}">${hrefLabel}</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isInvalidId(error: { code?: string } | null) {
  return error?.code === "22P02" || error?.code === "PGRST116";
}

async function productGuard(request: NextRequest) {
  const key = lastSegment(request.nextUrl.pathname);
  if (!key) return missingPage("Product not found", "The product you’re looking for doesn’t exist.", "/products", "Back to products");
  const client = anonClient();
  if (!client) return NextResponse.next();
  const { data, error } = await client
    .from("makeup_products")
    .select("product_key")
    .eq("product_key", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return NextResponse.next();
  if (!data) {
    return missingPage("Product not found", "The product you’re looking for doesn’t exist.", "/products", "Back to products");
  }
  return NextResponse.next();
}

async function lookGuard(request: NextRequest) {
  const id = lastSegment(request.nextUrl.pathname);
  if (!id) return missingPage("Look not found", "This look may have been deleted or doesn’t exist.", "/my-looks", "Return to My Looks");
  const client = anonClient();
  if (!client) return NextResponse.next();
  const { data, error } = await client.from("saved_looks").select("id").eq("id", id).maybeSingle();
  if (error) {
    if (isInvalidId(error)) {
      return missingPage("Look not found", "This look may have been deleted or doesn’t exist.", "/my-looks", "Return to My Looks");
    }
    return NextResponse.next();
  }
  if (!data) {
    return missingPage("Look not found", "This look may have been deleted or doesn’t exist.", "/my-looks", "Return to My Looks");
  }
  return NextResponse.next();
}

function ownsLog(logUserId: string | null, requesterId: string | null) {
  if (!logUserId) return true;
  return Boolean(requesterId) && logUserId === requesterId;
}

function readOwnerId(row: unknown): string | null {
  if (!row || typeof row !== "object" || !("user_id" in row)) return null;
  const value = row.user_id;
  return typeof value === "string" ? value : null;
}

async function requesterId(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function skinGuard(request: NextRequest) {
  const sessionId = lastSegment(request.nextUrl.pathname);
  const missing = () =>
    missingPage("Report not found", "This report could not be found.", "/skin-analysis", "Back to skin analysis");
  if (!sessionId) return missing();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.next();

  const response = NextResponse.next({ request });
  let userId: string | null = null;
  try {
    userId = await requesterId(request, response);
  } catch {
    userId = null;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("skin_analysis_logs")
    .select("user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    if (isInvalidId(error)) return missing();
    return response;
  }
  if (!data || !ownsLog(readOwnerId(data), userId)) return missing();
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/products/")) return withFailOpen(() => productGuard(request));
  if (pathname.startsWith("/looks/")) return withFailOpen(() => lookGuard(request));
  if (pathname.startsWith("/skin-analysis/results/")) return withFailOpen(() => skinGuard(request));
  return NextResponse.next();
}

export const config = {
  matcher: ["/products/:product_key", "/looks/:id", "/skin-analysis/results/:sessionId"],
};
