export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Чака потвърждение', tone: 'warn' },
  accepted: { label: 'Приета', tone: 'info' },
  in_preparation: { label: 'Приготвя се', tone: 'info' },
  partially_ready: { label: 'Частично готова', tone: 'accent' },
  ready: { label: 'Готова', tone: 'accent' },
  served: { label: 'Сервирана', tone: 'ok' },
  completed: { label: 'Приключена', tone: 'neutral' },
  cancelled: { label: 'Отказана', tone: 'neutral' },
};

export const ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: 'В опашка', tone: 'neutral' },
  preparing: { label: 'Приготвя се', tone: 'info' },
  ready: { label: 'Готово', tone: 'accent' },
  served: { label: 'Сервирано', tone: 'ok' },
  handed_off: { label: 'Сервирано', tone: 'ok' },
  cancelled: { label: 'Отказано', tone: 'neutral' },
};

export const TABLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: 'Свободна', tone: 'neutral' },
  occupied: { label: 'Заета', tone: 'info' },
  bill: { label: 'Иска сметка', tone: 'warn' },
  settled: { label: 'Платена', tone: 'ok' },
};

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'accent' | 'danger';

export const timeAgo = (iso: string, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
};

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });

export const parseEurInput = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
