import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {proxyTimeout: 120000},
  async rewrites() {
    if (process.env.FINSCOPE_COMBINED !== '1') return [];
    return [
      {source: '/api/:path*', destination: 'http://127.0.0.1:8001/api/:path*'},
      {source: '/health', destination: 'http://127.0.0.1:8001/health'},
    ];
  },
};
export default config;
