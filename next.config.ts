import type { NextConfig } from "next";

/**
 * Release identity and hardening, following the E:DEN platform conventions
 * (see docs/DEPLOYMENT.md):
 * - EDEN_DEPLOY_SHA is baked in at build time and exposed as X-Eden-Deploy-Sha,
 *   so deploy scripts can verify exactly which commit is serving.
 * - EDEN_NEXT_DIST_DIR allows building a candidate next to the live build
 *   (candidate/rollback swap, as for the E:DEN website).
 */
const deploySha = process.env.EDEN_DEPLOY_SHA ?? "development";

const securityHeaders = [
  { key: "X-Eden-Deploy-Sha", value: deploySha },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // same-origin: nothing leaks to other sites, while same-origin form POSTs keep a real Origin (CSRF checks).
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.EDEN_NEXT_DIST_DIR || ".next",
  env: { EDEN_DEPLOY_SHA: deploySha },
  async headers() {
    const headers = securityHeaders.map((header) => ({ ...header }));
    // HSTS only when served over https in production (nginx terminates TLS).
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
      // The browser only ever talks to the planner itself (Trello and AI calls are server-side).
      const csp = headers.find((h) => h.key === "Content-Security-Policy");
      if (csp) csp.value = `${csp.value}; connect-src 'self'; img-src 'self' data:`;
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
