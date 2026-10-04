import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auto-memoizes components and hooks (React 19), replacing most manual
  // useMemo / useCallback / React.memo.
  reactCompiler: true,
  // Playwright and some tooling hit the app via 127.0.0.1 while `next dev`
  // serves as localhost — allow both so client bundles hydrate.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "date-fns",
      "@tanstack/react-table",
    ],
  },
  async redirects() {
    // Prefer config redirects over page-level redirect() — Turbopack/React
    // performance.measure throws on aborted page renders in next dev.
    return [
      {
        source: "/admin",
        destination: "/admin/dashboard",
        permanent: false,
      },
      {
        source: "/admin/attributes",
        destination: "/admin/sizes",
        permanent: false,
      },
      {
        source: "/admin/brands",
        destination: "/admin/categories",
        permanent: false,
      },
      {
        source: "/admin/collections",
        destination: "/admin/categories",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
