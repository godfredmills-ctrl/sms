import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the trace root to this project — a lockfile in a parent folder would
  // otherwise make Next infer the wrong workspace and mis-trace the build.
  outputFileTracingRoot: path.join(import.meta.dirname, "."),
  serverExternalPackages: ["exceljs", "web-push", "nodemailer", "pdf-lib"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Server Actions handle large payloads (bulk imports, template uploads).
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
