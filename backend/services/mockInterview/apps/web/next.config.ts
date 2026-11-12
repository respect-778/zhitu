import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { NextConfig } from "next";

const projectEnv = resolve(__dirname, "../../.env");
if (existsSync(projectEnv) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(projectEnv);
}

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH || "",
  distDir: process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH
    ? ".next-website"
    : ".next",
  transpilePackages: ["@deepinterview/shared"],
  outputFileTracingRoot: resolve(__dirname, "../.."),
  // WP-12: emit a self-contained server bundle (.next/standalone) so the
  // production Docker image is a slim `node server.js` with no node_modules
  // install at runtime. Additive — does not affect `next dev` / `next start`.
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
