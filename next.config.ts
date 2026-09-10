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
              // Supabase only. The scanner backend is reached from the SERVER
              // (src/lib/runner.ts), never from the browser, so it is
              // deliberately absent. A `pathfinder-api-*.onrender.com` origin
              // used to sit here — a different project entirely, copy-paste
              // debt that granted a foreign host connect access.
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co;",
              "img-src 'self' data: https:;",
              "font-src 'self' data: https:;",
              "frame-ancestors 'none';",
              // default-src does not cover these three.
              "base-uri 'self';",      // stops an injected <base> re-pointing relative URLs
              "form-action 'self';",   // stops an injected form posting credentials offsite
              "object-src 'none';"     // no plugins, ever
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
