import type { NextConfig } from "next";

// Medusa backend URL - used for rewrites proxy
// Falls back to production URL if env var is not set
const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL ||
  'https://admin.shilamurti.com';

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  webpack: (config, { isServer }) => {
    // Handle SVG files
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
  // Proxy /store/* requests to Medusa backend
  // This ensures API requests work even if NEXT_PUBLIC_MEDUSA_API_BASE_URL
  // is missing or uses relative paths
  async rewrites() {
    return [
      {
        source: '/store/:path*',
        destination: `${MEDUSA_BACKEND_URL}/store/:path*`,
      },
      {
        source: '/admin/:path*',
        destination: `${MEDUSA_BACKEND_URL}/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
