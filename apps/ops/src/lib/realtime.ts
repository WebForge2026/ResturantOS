import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';

type Handler = (event: string, payload: Record<string, unknown>) => void;
type EchoLike = {
  private: (n: string) => { listen: (e: string, cb: (p: Record<string, unknown>) => void) => unknown };
  leave: (n: string) => void;
  disconnect: () => void;
  connector: { pusher: { connection: { bind: (e: string, cb: (s: { current: string }) => void) => void } } };
};

const EVENTS = ['order.created', 'order.updated', 'prep.updated', 'check.updated', 'table.updated', 'request.created', 'request.updated', 'payment.captured', 'stock.low'];

let echo: EchoLike | null = null;
let echoToken: string | null = null;
const listeners = new Set<Handler>();
const statusListeners = new Set<(up: boolean) => void>();
let up = false;
let subscribed: string | null = null;

async function ensureEcho(token: string, branchId: number) {
  if (echo && echoToken === token && subscribed === `branch.${branchId}`) return;
  if (echo) {
    try {
      echo.disconnect();
    } catch {
      /* ignore */
    }
    echo = null;
  }
  const [{ default: Echo }, { default: Pusher }] = await Promise.all([import('laravel-echo'), import('pusher-js')]);
  (window as unknown as { Pusher: unknown }).Pusher = Pusher;
  const port = Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80));
  echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_KEY ?? 'noar-local-key',
    wsHost: window.location.hostname,
    wsPort: port,
    wssPort: port,
    forceTLS: window.location.protocol === 'https:',
    enabledTransports: ['ws', 'wss'],
    authEndpoint: '/api/broadcasting/auth',
    auth: { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  }) as unknown as EchoLike;
  echoToken = token;
  subscribed = `branch.${branchId}`;
  echo.connector.pusher.connection.bind('state_change', (s) => {
    up = s.current === 'connected';
    statusListeners.forEach((l) => l(up));
    if (up) listeners.forEach((l) => l('reconnected', {}));
  });
  const ch = echo.private(`branch.${branchId}`);
  EVENTS.forEach((e) => ch.listen(`.${e}`, (p) => listeners.forEach((l) => l(e, p))));
}

/**
 * Realtime is a notification transport, not the source of truth: every event (and every reconnect)
 * invalidates react-query caches so data is refetched from Laravel. Queries also poll as a fallback.
 */
export const useRealtime = (onEvent?: Handler) => {
  const token = useAuth((s) => s.token);
  const branchId = useAuth((s) => s.branchId);
  const qc = useQueryClient();
  const [connected, setConnected] = useState(up);

  useEffect(() => {
    if (!token || !branchId) return;
    void ensureEcho(token, branchId).catch(() => setConnected(false));
    const h: Handler = (e, p) => {
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
      onEvent?.(e, p);
    };
    listeners.add(h);
    const s = (v: boolean) => setConnected(v);
    statusListeners.add(s);
    return () => {
      listeners.delete(h);
      statusListeners.delete(s);
    };
  }, [token, branchId, qc, onEvent]);

  return connected;
};

export const disconnectRealtime = () => {
  try {
    echo?.disconnect();
  } catch {
    /* ignore */
  }
  echo = null;
  subscribed = null;
};
