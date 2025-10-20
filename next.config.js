/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: 'loose'
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
  // Ensure proper build output
  generateBuildId: async () => {
    return 'build-' + Date.now();
  }
};

module.exports = nextConfig;
