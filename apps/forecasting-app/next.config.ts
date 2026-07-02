import type { NextConfig } from "next";

const allowedOrigins = [
  "localhost:8080",
  "127.0.0.1:8080",
  "petyr.draftapps.it",
  "petyr.unguess-internal.net"
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins
    }
  }
};

export default nextConfig;
