'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicSessionState } from '@noar/types';
import { ApiError } from '@noar/api-client';
import { api } from './api';

type Live = {
  state: PublicSessionState | null;
  connected: boolean;
  refresh: () => Promise<void>;
  error: string | null;
};

type EchoLike = { channel: (n: string) => { listen: (e: string, cb: () => void) => unknown }; leave: (n: string) => void; disconnect: () => void; connector: { pusher: { connection: { bind: (e: string, cb: (s: { current: string }) => void) => void } } } };

/**
 * Authoritative guest session state from Laravel.
 * WebSocket (Reverb) events are only hints that trigger a refetch; polling is the fallback
 * (5s with exponential backoff to 30s on errors, 30s safety poll while the socket is up).
 */
export const useLiveSession = (guestToken: string | null, onClosed: () => void): Live => {
  const [state, setState] = useState<PublicSessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  const refresh = useCallback(async () => {
    if (!guestToken) return;
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      try {
        const s = await api.session(guestToken);
        failures.current = 0;
        setError(null);
        setState(s);
        if (s.status === 'closed') closedRef.current();
      } catch (e) {
        failures.current += 1;
        if (e instanceof ApiError && e.status === 404) {
          closedRef.current();
          setState(null);
        } else {
          setError(e instanceof ApiError ? e.message : 'Няма връзка');
        }
      } finally {
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, [guestToken]);

  // WebSocket hints
  useEffect(() => {
    if (!guestToken) return;
    let echo: EchoLike | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [{ default: Echo }, { default: Pusher }] = await Promise.all([import('laravel-echo'), import('pusher-js')]);
        if (cancelled) return;
        (window as unknown as { Pusher: unknown }).Pusher = Pusher;
        const instance = new Echo({
          broadcaster: 'reverb',
          key: process.env.NEXT_PUBLIC_REVERB_KEY ?? 'noar-local-key',
          wsHost: window.location.hostname,
          wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080),
          wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080),
          forceTLS: (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'http') === 'https',
          enabledTransports: ['ws', 'wss'],
        }) as unknown as EchoLike;
        echo = instance;
        instance.connector.pusher.connection.bind('state_change', (s) => {
          const up = s.current === 'connected';
          setConnected(up);
          if (up) void refresh(); // recover anything missed while disconnected
        });
        const ch = instance.channel(`guest.${guestToken}`);
        ch.listen('.order.updated', () => void refresh());
        ch.listen('.session.updated', () => void refresh());
      } catch {
        setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
      try {
        echo?.leave(`guest.${guestToken}`);
        echo?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [guestToken, refresh]);

  // Polling fallback with backoff
  useEffect(() => {
    if (!guestToken) {
      setState(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      await refresh();
      if (stopped) return;
      const base = connected ? 30000 : 5000;
      const delay = Math.min(30000, base * 2 ** Math.min(failures.current, 3));
      timer = setTimeout(tick, delay);
    };
    void tick();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [guestToken, connected, refresh]);

  return { state, connected, refresh, error };
};
