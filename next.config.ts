import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self';",
              "script-src 'self' 'unsafe-inline';", // Required for Next.js page hydration and click/submit event handlers
              "style-src 'self' 'unsafe-inline';", // Required for Tailwind CSS styling runtime injection
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://pathfinder-api-845b.onrender.com;",
              "img-src 'self' data: https:;",
              "font-src 'self' data: https:;",
              "frame-ancestors 'none';"
            ].join(" ")
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
