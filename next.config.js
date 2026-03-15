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
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: 'loose'
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
    
    // Fix for MetaMask SDK chunk loading issues
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          metamask: {
            test: /[\\/]node_modules[\\/]@metamask[\\/]/,
            name: 'metamask',
            chunks: 'all',
            priority: 10,
          },
        },
      },
    };
    
    return config;
  },
  // הוסר generateBuildId - Next.js יוצר build ID אוטומטית
};

module.exports = nextConfig;
