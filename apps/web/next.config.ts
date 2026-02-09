import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@propertypro/ui",
    "@propertypro/shared",
    "@propertypro/db",
    "@propertypro/email",
  ],
};

export default nextConfig;
