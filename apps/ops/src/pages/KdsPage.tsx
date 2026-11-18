import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, ChefHat, Flame, GlassWater, RotateCcw, Timer } from 'lucide-react';
import { mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { useRealtime } from '@/lib/realtime';
import { cx, timeAgo } from '@/lib/format';
import { AppBar } from '@/components/AppBar';
import { Badge, Button, Empty, Segmented, Spinner, toast, useNow } from '@/components/ui';

type PrepItem = { id: number; status: 'queued' | 'preparing' | 'ready' | 'handed_off' | 'cancelled'; name: string; quantity: number; modifiers: string[]; note: string | null };
type Ticket = {
  id: number;
  status: string;
  station: { id: number; name: string; code: string; color: string };
  order_id: number;
  order_number: number;
  order_note: string | null;
  source: 'qr' | 'staff';
  table_label: string;
  created_at: string;
  started_at: string | null;
  items: PrepItem[];
};
type KdsData = { stations: Array<{ id: number; name: string; code: string; color: string }>; tickets: Ticket[] };

const beep = () => {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio unavailable */
  }
};

/** Kitchen Display / Bar Display — per-item preparation with ticket aggregates. */
export function KdsPage({ display }: { display: 'kitchen' | 'bar' }) {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem('noar.kds.sound') === '1';
    } catch {
      return false;
    }
  });
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const onEvent = useCallback((e: string) => {
    if ((e === 'order.updated' || e === 'order.created') && soundRef.current) beep();
  }, []);
  const connected = useRealtime(onEvent);
  const [station, setStation] = useState<string>('all');
  const [showDone, setShowDone] = useState(false);
  const { data, isLoading, isError, refetch } = useBranchQuery<KdsData>(['kds', display, station, showDone], `/kds?display=${display}${station !== 'all' ? `&station_id=${station}` : ''}${showDone ? '&include_done=1' : ''}`, { refetchInterval: connected ? 20000 : 4000 });
  const now = useNow(10000);
  const [pending, setPending] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      localStorage.setItem('noar.kds.sound', sound ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sound]);

  const set = async (path: string, status: string, key: number) => {
    setPending((p) => new Set(p).add(key));
    try {
      await mutate(path, 'PATCH', { status });
      await qc.invalidateQueries({ queryKey: ['b', branchId, 'kds'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  };

  const tickets = (data?.tickets ?? []).filter((t) => showDone || t.status !== 'handed_off');
  const active = tickets.filter((t) => t.status !== 'ready' && t.status !== 'handed_off');
  const done = tickets.filter((t) => t.status === 'ready' || t.status === 'handed_off');
  const Icon = display === 'bar' ? GlassWater : ChefHat;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={display === 'bar' ? 'Бар дисплей' : 'Кухненски дисплей'} connected={connected}>
        <button onClick={() => { setSound((v) => !v); if (!sound) beep(); }} className={cx('mr-1 flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[12.5px] font-semibold', sound ? 'border-accent/40 text-accent' : 'border-line text-muted')} aria-pressed={sound}>
          {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} <span className="hidden sm:inline">Звук</span>
        </button>
      </AppBar>

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
        {data && data.stations.length > 1 && (
          <Segmented value={station} onChange={setStation} options={[{ value: 'all', label: 'Всички станции' }, ...data.stations.map((s) => ({ value: String(s.id), label: s.name }))]} />
        )}
        <div className="flex items-center gap-4 text-[13px] text-muted">
          <span><b className="tabular text-fg">{active.length}</b> активни</span>
          <span><b className="tabular text-accent">{active.reduce((s, t) => s + t.items.filter((i) => i.status === 'queued').length, 0)}</b> чакащи артикула</span>
        </div>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--accent)]" /> Покажи завършени
        </label>
      </div>

      <main className="flex-1 p-3 sm:p-5">
        {isLoading ? (
          <div className="grid h-60 place-items-center"><Spinner /></div>
        ) : isError ? (
          <Empty title="Няма връзка със сървъра" text="Данните ще се заредят отново автоматично." action={<Button onClick={() => refetch()}>Опитай пак</Button>} />
        ) : tickets.length === 0 ? (
          <Empty icon={<Icon className="h-5 w-5" />} title="Няма чакащи поръчки" text="Новите поръчки ще се появят тук автоматично." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence initial={false}>
              {[...active, ...done].map((t) => (
                <TicketCard key={t.id} t={t} now={now} pending={pending} onItem={(i, s) => set(`/prep-items/${i.id}`, s, i.id)} onTicket={(s) => set(`/prep-tickets/${t.id}`, s, -t.id)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function TicketCard({ t, now, pending, onItem, onTicket }: { t: Ticket; now: number; pending: Set<number>; onItem: (i: PrepItem, s: string) => void; onTicket: (s: string) => void }) {
  const ageMin = (now - new Date(t.created_at).getTime()) / 60000;
  const done = t.status === 'ready' || t.status === 'handed_off';
  const urgency = done ? 'done' : ageMin > 15 ? 'late' : ageMin > 8 ? 'warn' : 'ok';
  const live = t.items.filter((i) => i.status !== 'cancelled');
  const anyQueued = live.some((i) => i.status === 'queued');

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: done ? 0.6 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={cx('flex flex-col overflow-hidden rounded-2xl border bg-surface', urgency === 'late' ? 'border-danger/60' : urgency === 'warn' ? 'border-warn/50' : 'border-line')}
    >
      <header className={cx('flex items-center justify-between gap-2 px-4 py-3', urgency === 'late' ? 'bg-danger-soft' : urgency === 'warn' ? 'bg-warn-soft' : 'bg-surface-2')}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold tracking-tight">{t.table_label}</span>
            <span className="tabular text-[13px] text-muted">№ {t.order_number}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: t.station.color }} />
            {t.station.name} · {t.source === 'qr' ? 'QR' : 'Персонал'}
          </div>
        </div>
        <div className={cx('flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-bold tabular', urgency === 'late' ? 'text-danger' : urgency === 'warn' ? 'text-warn' : 'text-muted')}>
          <Timer className="h-4 w-4" /> {timeAgo(t.created_at, now)}
        </div>
      </header>

      {t.order_note && <div className="mx-3 mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] font-medium text-warn">📝 {t.order_note}</div>}

      <ul className="flex-1 space-y-1.5 p-3">
        {t.items.map((i) => {
          const busy = pending.has(i.id);
          const next = i.status === 'queued' ? 'preparing' : i.status === 'preparing' ? 'ready' : null;
          return (
            <li key={i.id} className={cx('rounded-xl border transition-colors', i.status === 'ready' ? 'border-ok/40 bg-ok-soft' : i.status === 'preparing' ? 'border-info/40 bg-info-soft' : i.status === 'cancelled' ? 'border-line opacity-40' : 'border-line bg-surface-2')}>
              <div className="flex items-center gap-3 p-2.5">
                <span className="tabular grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg text-[18px] font-bold">{i.quantity}</span>
                <div className="min-w-0 flex-1">
                  <div className={cx('text-[15px] font-semibold leading-tight', i.status === 'cancelled' && 'line-through')}>{i.name}</div>
                  {i.modifiers.length > 0 && <div className="mt-0.5 text-[12.5px] text-muted">{i.modifiers.join(' · ')}</div>}
                  {i.note && <div className="mt-0.5 text-[12.5px] font-medium text-warn">↳ {i.note}</div>}
                </div>
                {next ? (
                  <Button size="lg" variant={next === 'ready' ? 'ok' : 'secondary'} className="min-w-[112px]" loading={busy} onClick={() => onItem(i, next)} icon={next === 'ready' ? <Check className="h-4 w-4" /> : <Flame className="h-4 w-4" />}>
                    {next === 'ready' ? 'Готово' : 'Започни'}
                  </Button>
                ) : i.status === 'ready' ? (
                  <button disabled={busy} onClick={() => onItem(i, 'preparing')} className="flex h-10 items-center gap-1 rounded-xl px-2 text-[12px] font-semibold text-ok hover:bg-surface-2" title="Върни в приготвяне">
                    <Check className="h-4 w-4" /> Готово <RotateCcw className="h-3.5 w-3.5 opacity-60" />
                  </button>
                ) : (
                  <Badge tone={i.status === 'handed_off' ? 'ok' : 'neutral'}>{i.status === 'handed_off' ? 'Сервирано' : 'Отказано'}</Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!done && live.length > 1 && (
        <footer className="grid grid-cols-2 gap-2 border-t border-line p-3">
          <Button variant="secondary" disabled={!anyQueued} loading={pending.has(-t.id)} onClick={() => onTicket('preparing')}>Започни всички</Button>
          <Button variant="ok" loading={pending.has(-t.id)} onClick={() => onTicket('ready')}>Всичко готово</Button>
        </footer>
      )}
    </motion.article>
  );
}
