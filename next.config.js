const path = require("path");

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // הוסר Cross-Origin-Opener-Policy כדי לאפשר תאימות עם Coinbase Wallet
  // HSTS רק בפרודקשן (אם האתר כולו HTTPS)
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
  // CSP בסיסי
  // Note: 'unsafe-eval' is required for Next.js react-refresh in development
  // In production, it should be removed for better security
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      `script-src 'self' 'unsafe-inline' ${isProduction ? '' : "'unsafe-eval'"} https:`,
      "connect-src 'self' https: wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname),
  async redirects() {
    return [
      { source: "/blackjack", destination: "/21-challenge", permanent: true },
      { source: "/poker", destination: "/card-arena", permanent: true },
      { source: "/roulette", destination: "/color-wheel", permanent: true },
      { source: "/baccarat", destination: "/card-duel", permanent: true },
      { source: "/craps", destination: "/dice-arena", permanent: true },
      { source: "/sicbo", destination: "/triple-dice", permanent: true },
      { source: "/slots-upgraded", destination: "/symbol-match", permanent: true },
      { source: "/three-card-poker", destination: "/triple-cards", permanent: true },
      { source: "/ultimate-poker", destination: "/ultimate-cards", permanent: true },
      {
        source: "/ov2-tile-rush-duel",
        destination: "/online-v2/rooms",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  // הוסר generateBuildId - Next.js יוצר build ID אוטומטית
};

module.exports = nextConfig;
