import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline scripts for hydration; 'unsafe-eval' only in dev for fast refresh.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // https: allows previewing the public email logo (EMAIL_LOGO_URL) and map tiles.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["embedded-postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async redirects() {
    // "Ready for WhatsApp" moved from Practices to the WhatsApp section; keep old bookmarks working.
    return [{ source: "/attendance/eligible", destination: "/whatsapp-groups/ready", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
