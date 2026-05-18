import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose JWT_EXPIRY_SECONDS to the browser (same name as gateway/.env)
  env: {
    JWT_EXPIRY_SECONDS: process.env.JWT_EXPIRY_SECONDS,
  },
};

export default nextConfig;
