'use client';

import { useState } from 'react';

export function UnsubscribeForm() {
  const [state, setState] = useState<'ready' | 'sending' | 'done' | 'invalid' | 'unavailable'>('ready');

  async function submit() {
    const token = window.location.hash.slice(1);
    if (!token) {
      setState('invalid');
      return;
    }
    setState('sending');
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? 'done' : response.status === 503 ? 'unavailable' : 'invalid');
      if (response.ok) window.history.replaceState(null, '', window.location.pathname);
    } catch {
      setState('unavailable');
    }
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="unsubscribe-title">
        <h1 id="unsubscribe-title">Email preferences</h1>
        {state === 'done' ? (
          <p>You have been unsubscribed from FloLabs marketing emails.</p>
        ) : state === 'invalid' ? (
          <p>This unsubscribe link is not valid. Please use the link from your FloLabs email.</p>
        ) : state === 'unavailable' ? (
          <p>We could not update your email preferences. Please try again later.</p>
        ) : (
          <>
            <p>Confirm that you want to stop receiving FloLabs marketing emails.</p>
            <button type="button" onClick={submit} disabled={state === 'sending'}>
              {state === 'sending' ? 'Updating…' : 'Unsubscribe'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
