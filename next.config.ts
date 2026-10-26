import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright runs a separate server against its own DB in a separate build dir
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
