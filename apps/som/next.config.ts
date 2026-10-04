import type { NextConfig } from 'next';

// S-O-M runs as its own service (its own database, bucket and domain), from
// this folder of the i2w2i repository. Nothing here talks to the family site.
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // This folder has its own lockfile; don't let Next pick the repo root.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
