import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several dev servers run from one checkout without trampling each
  // other's build output (used during the parallel build; harmless in prod).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
