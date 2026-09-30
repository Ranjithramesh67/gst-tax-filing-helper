/** @type {import('next').NextConfig} */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gstflow/api-client', '@gstflow/types', '@gstflow/validation'],
  experimental: {
    allowedHosts: ['.monkeycode-ai.live'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_PROXY_TARGET}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
