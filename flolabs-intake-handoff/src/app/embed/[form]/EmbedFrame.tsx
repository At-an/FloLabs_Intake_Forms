'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Tells embed.js on the host page how tall the form is, so the iframe never needs a scrollbar.
// The message carries only a height, so it can be posted to any parent; embed.js checks that
// it comes from the forms origin.
export function EmbedFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.parent === window) return;
    const report = () =>
      window.parent.postMessage({ source: 'flolabs-form', type: 'height', height: Math.ceil(element.getBoundingClientRect().height) + 32 }, '*');
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{children}</div>;
}
