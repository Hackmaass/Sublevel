import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the venue relay streams Server-Sent Events: never gzip/buffer them
  compress: false,
  // phones reaching `next dev` over the LAN (the demo uses `pnpm web:demo`, a production build, which needs none of this)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Game is a client-heavy WebGL app: keep the default (non-cacheComponents) rendering model.
  transpilePackages: ["@sublevel/engine"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
