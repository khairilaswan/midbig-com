import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone build includes workspace packages.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
