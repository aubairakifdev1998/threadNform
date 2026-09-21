import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
