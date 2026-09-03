// src/lib/supabase/request-auth.ts
/**
 * Resolves the caller of a route handler from *either* a browser cookie session
 * or an `Authorization: Bearer` header.
 *
 * Why this exists: the website authenticates with Supabase's SSR cookies, but the
 * Flutter app holds its session in `shared_preferences` and sends it as a Bearer
 * token. `createSupabaseServerClient()` only ever looks at cookies, so a route
 * built with it returns 401 to the app no matter how valid the app's token is —
 * and because the Dart services swallow the failure, the symptom is an empty
 * screen rather than an error. Any route both clients call must go through here.
 *
 * The returned client is scoped to whichever identity was found, so RLS applies
 * exactly as it would for that user. No service-role key is involved.
 */

import { createSupabaseAnonWithHeaders, createSupabaseServerClient } from "./server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export type RequestAuth = {
  /** A client already bound to this user's identity — use it for all queries. */
  supabase: SupabaseClient;
  user: User;
  /** Which credential was accepted. Useful in logs when debugging one client. */
  via: "cookie" | "bearer";
};

/**
 * @returns the caller, or null when no valid credential was presented.
 *
 * Bearer is tried first. A request carrying an explicit token is stating which
 * identity it wants; if a stale cookie also happened to be attached, silently
 * preferring the cookie would write one user's data under another's session.
 */
export async function resolveRequestAuth(
  request: Request
): Promise<RequestAuth | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (token) {
    const supabase = await createSupabaseAnonWithHeaders({
      Authorization: `Bearer ${token}`,
    });
    // getUser(token) verifies against the auth server rather than trusting the
    // JWT's own claims, so an expired or revoked token is rejected here.
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { supabase: supabase as SupabaseClient, user: data.user, via: "bearer" };
    }
    // A token was offered and refused. Fall through to cookies rather than
    // failing outright: the browser sends no Authorization header, but a proxy
    // or an extension occasionally adds one, and that should not lock a
    // logged-in user out of their own site.
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { supabase: supabase as unknown as SupabaseClient, user: data.user, via: "cookie" };
}
