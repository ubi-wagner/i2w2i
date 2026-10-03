import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Loaded from node_modules at runtime rather than bundled (exifr probes for
  // Node built-ins and logs noise when bundled).
  serverExternalPackages: ['exifr'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Ask Chromium browsers for device model and OS version (activity records).
          { key: 'Accept-CH', value: 'Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List' },
        ],
      },
    ];
  },
};

export default nextConfig;
