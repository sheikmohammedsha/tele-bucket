import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The local SQLite index/session lives in .data/ and must never be traced
  // into a build. (The packaging workflows also strip it defensively.)
  outputFileTracingExcludes: {
    "*": [".data/**", ".env", ".env.local", ".env.production"],
  },
  cacheComponents: false,
  serverExternalPackages: ["teleproto"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;