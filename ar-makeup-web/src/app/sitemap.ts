import type { MetadataRoute } from "next";

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "http://localhost:3000";
  return configured.replace(/\/$/, "");
}

const PUBLIC_PATHS = [
  "/",
  "/products",
  "/cart",
  "/try-on",
  "/skin-analysis",
  "/skin-analysis/scan",
  "/skin-analysis/questionnaire",
  "/support",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? `${origin}/` : `${origin}${path}`,
  }));
}
