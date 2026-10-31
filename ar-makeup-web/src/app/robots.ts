import type { MetadataRoute } from "next";

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "http://localhost:3000";
  return configured.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/api",
        "/admin",
        "/auth",
        "/checkout",
        "/account",
        "/my-orders",
        "/my-looks",
        "/order",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
