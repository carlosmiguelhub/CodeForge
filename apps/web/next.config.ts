import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@sqweb/contracts"],
  // Temporary — for testing on a phone over the LAN. Revert before
  // committing; see the sqweb-mobile-lan-dev memory.
  allowedDevOrigins: ["192.168.1.49"],
};

export default withSerwist(nextConfig);
