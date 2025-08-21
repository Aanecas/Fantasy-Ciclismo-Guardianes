import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Fuerza a que el root del workspace sea /web (donde está este next.config)
    root: __dirname,
  },
};

export default nextConfig;
