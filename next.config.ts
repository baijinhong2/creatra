import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // canonical site URL — used in metadata, OpenGraph, and absolute asset paths
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "https://creatra.xyz",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "creatra",
    NEXT_PUBLIC_APP_TAGLINE_ZH: process.env.NEXT_PUBLIC_APP_TAGLINE_ZH ?? "社交运营顾问",
    NEXT_PUBLIC_APP_TAGLINE_EN: process.env.NEXT_PUBLIC_APP_TAGLINE_EN ?? "Social Advisor",
  },
};

export default nextConfig;
