import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@propertypro/ui",
    "@propertypro/shared",
    "@propertypro/db",
    "@propertypro/email",
  ],
};

export default withSentryConfig(nextConfig, {
  // Upload source maps only when SENTRY_AUTH_TOKEN is available
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Disable Sentry telemetry
  telemetry: false,

  // Only upload source maps when auth token is present
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Automatically tree-shake Sentry logger in production
  disableLogger: true,
});
