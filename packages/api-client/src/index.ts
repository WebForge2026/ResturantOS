import type {
  ApiErrorBody,
  CartLineInput,
  DemoTable,
  PlaceOrderResponse,
  PublicSessionState,
  PublicTableContext,
} from '@noar/types';

export * from '@noar/types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export type ClientOptions = {
  baseUrl?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

export const newIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const createHttp = (options: ClientOptions = {}) => {
  const baseUrl = options.baseUrl ?? '';

  return async <T>(path: string, req: RequestOptions = {}): Promise<T> => {
    const url = new URL(`${baseUrl}/api/v1${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    Object.entries(req.query ?? {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;
    const token = options.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal: req.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ApiError(0, 'network_error', 'Няма връзка със сървъра. Проверете мрежата и опитайте отново.');
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json: unknown = text ? safeJson(text) : null;

    if (!res.ok) {
      if (res.status === 401) options.onUnauthorized?.();
      const body = json as Partial<ApiErrorBody> | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? 'http_error',
        body?.error?.message ?? `Грешка ${res.status}`,
        body?.error?.details,
      );
    }
    return json as T;
  };
};

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Public (guest) QR-menu API. */
export const createPublicApi = (options: ClientOptions = {}) => {
  const http = createHttp(options);
  return {
    demoTables: () => http<{ data: DemoTable[] }>('/public/demo/tables'),
    table: (qrToken: string) => http<PublicTableContext>(`/public/tables/${encodeURIComponent(qrToken)}`),
    placeOrder: (qrToken: string, body: { items: CartLineInput[]; note?: string; guest_token?: string | null }, idempotencyKey: string) =>
      http<PlaceOrderResponse>(`/public/tables/${encodeURIComponent(qrToken)}/orders`, { method: 'POST', body, idempotencyKey }),
    session: (guestToken: string) => http<PublicSessionState>(`/public/sessions/${encodeURIComponent(guestToken)}`),
    serviceRequest: (guestToken: string, type: 'bill' | 'waiter', idempotencyKey: string) =>
      http<{ ok: true }>(`/public/sessions/${encodeURIComponent(guestToken)}/requests`, { method: 'POST', body: { type }, idempotencyKey }),
  };
};

export type PublicApi = ReturnType<typeof createPublicApi>;

/** Money helpers — totals displayed by clients are previews; the server is authoritative. */
export const BGN_PER_EUR = 1.95583;

export const formatEur = (cents: number): string =>
  new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100);

export const formatBgn = (cents: number, rate = BGN_PER_EUR): string => {
  const bgn = Math.round((cents * rate)) / 100;
  return `${new Intl.NumberFormat('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bgn)} лв.`;
};
