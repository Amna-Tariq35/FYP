import type { Metadata } from "next";
import BridgeClient from "./BridgeClient";

/**
 * Receives a Supabase session handed over from the Flutter app.
 *
 * The app opens this route with the tokens in the **URL fragment**:
 *
 *   /auth/bridge#at=<access_token>&rt=<refresh_token>&next=/looks/123
 *
 * A fragment is used rather than a query string because browsers never transmit
 * it to the server — so the tokens never land in a server, proxy or CDN access
 * log. See `lib/app/services/web_bridge.dart` in the app for the sending half.
 *
 * `noindex` is not cosmetic: this URL must never end up in a search index or a
 * crawler's queue.
 */
export const metadata: Metadata = {
  title: "Signing you in…",
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthBridgePage() {
  return <BridgeClient />;
}
