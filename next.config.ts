import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          {
            // Prevent clickjacking by disallowing framing
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Prevent MIME type sniffing
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Control referrer information sent with requests
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Restrict browser features and APIs
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            // Content Security Policy
            // - default-src 'self': Only allow resources from same origin by default
            // - script-src 'self' 'unsafe-inline' 'unsafe-eval': Required for Next.js
            // - style-src 'self' 'unsafe-inline': Required for styled-jsx and inline styles
            // - img-src 'self' data: blob: https:: Allow images from self, data URIs, blobs, and HTTPS
            // - font-src 'self': Only allow fonts from same origin
            // - connect-src 'self' https:: Allow API calls to same origin and HTTPS endpoints
            // - frame-ancestors 'none': Prevent embedding in iframes (like X-Frame-Options)
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
