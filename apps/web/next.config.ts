import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The QR/phone relay keeps its rooms in ONE server process's memory: right on a laptop (`pnpm web:demo`), wrong on serverless
  // hosting where each request may hit a different instance. So the hosted build (Vercel sets VERCEL) ships without it and phones
  // connect to the projector peer-to-peer (WebRTC) instead. SUBLEVEL_P2P=1 turns that mode on for a local build (testing).
  env: {
    NEXT_PUBLIC_RELAY: process.env.VERCEL || process.env.SUBLEVEL_P2P ? "0" : "1",
    NEXT_PUBLIC_P2P: process.env.VERCEL || process.env.SUBLEVEL_P2P ? "1" : "0",
  },
  // the venue relay streams Server-Sent Events: never gzip/buffer them
  compress: false,
  // phones reaching `next dev` over the LAN (the demo uses `pnpm web:demo`, a production build, which needs none of this)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Game is a client-heavy WebGL app: keep the default (non-cacheComponents) rendering model.
  transpilePackages: ["@sublevel/engine", "@sublevel/chain"],
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
