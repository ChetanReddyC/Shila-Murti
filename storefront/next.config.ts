import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow local cross-origin access between localhost and 127.0.0.1 in dev
    allowedDevOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
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
};

export default nextConfig;
