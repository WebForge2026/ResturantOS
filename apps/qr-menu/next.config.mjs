/** @type {import('next').NextConfig} */
const apiOrigin = process.env.NOAR_API_ORIGIN ?? 'http://127.0.0.1:8000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@noar/api-client', '@noar/types'],
  // Allows phones on the same LAN to load dev assets (local demo only).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '*.local'],
  async rewrites() {
    // Same-origin API: the phone only needs to reach port 3000.
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
