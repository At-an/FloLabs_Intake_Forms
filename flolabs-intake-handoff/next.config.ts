import type { NextConfig } from 'next';
import { embedFrameAncestors } from './src/shared/config/sites';

const development = process.env.NODE_ENV !== 'production';

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Everything except the embed pages may not be framed at all.
        source: '/((?!embed/).*)',
        headers: [
          ...baseHeaders,
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // Embed pages: any HTTPS website may frame them (decided 2026-10-24, src/shared/config/sites.ts).
        source: '/embed/:form*',
        headers: [...baseHeaders, { key: 'Content-Security-Policy', value: `frame-ancestors ${embedFrameAncestors(development)}` }],
      },
    ];
  },
};

export default nextConfig;
