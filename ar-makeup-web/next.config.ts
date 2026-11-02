/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Remote catalog photos come from many hosts. Keep the optimizer off
    // so those URLs are not fetched or rewritten by Next.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=()",
      },
    ];
    const longCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800",
      },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/images/:path*", headers: [...security, ...longCache] },
      { source: "/effects/:path*", headers: [...security, ...longCache] },
    ];
  },
};

module.exports = nextConfig;