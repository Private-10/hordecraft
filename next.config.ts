import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  ...(process.env.ELECTRON_BUILD === 'true' ? { output: 'export' as const } : {}),
};

export default nextConfig;
