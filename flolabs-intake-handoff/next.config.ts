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
        // Embed pages: only allow-listed FloLabs websites may frame them (CLAUDE.md section 5).
        source: '/embed/:form*',
        headers: [...baseHeaders, { key: 'Content-Security-Policy', value: `frame-ancestors ${embedFrameAncestors(development)}` }],
      },
    ];
  },
};

export default nextConfig;
