import type { NextConfig } from 'next';
import { embedFrameAncestors } from './src/shared/config/sites';

const development = process.env.NODE_ENV !== 'production';

// Cloudflare Turnstile loads a script and an iframe from this origin.
const TURNSTILE = 'https://challenges.cloudflare.com';

/**
 * Content-Security-Policy (T15). Only this site and Turnstile may load scripts, frames and
 * connections; no plugins, no <base> or form-action hijacking. `'unsafe-inline'` scripts are
 * needed by Next.js' inline bootstrap scripts (a per-request nonce would remove it; recorded as
 * a known limitation). Development adds eval and websockets for hot reload.
 */
function contentSecurityPolicy(frameAncestors: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${TURNSTILE}${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${TURNSTILE}${development ? ' ws: wss:' : ''}`,
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  // HTTPS only, for two years (production only: local development runs on http://localhost).
  ...(development ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
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
          { key: 'Content-Security-Policy', value: contentSecurityPolicy("'none'") },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // Embed pages: only the FloLabs websites may frame them (src/shared/config/sites.ts).
        source: '/embed/:form*',
        headers: [...baseHeaders, { key: 'Content-Security-Policy', value: contentSecurityPolicy(embedFrameAncestors(development)) }],
      },
    ];
  },
};

export default nextConfig;
