import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, HandPlatter, LayoutGrid, ListChecks, Receipt, Check } from 'lucide-react';
import { mutate, type LiveTable, type StaffOrder } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { useRealtime } from '@/lib/realtime';
import { cx, timeAgo } from '@/lib/format';
import { AppBar } from '@/components/AppBar';
import { FloorMap } from '@/components/FloorMap';
import { SessionPanel } from '@/components/SessionPanel';
import { Badge, Button, Empty, Spinner, toast, useNow } from '@/components/ui';

type Feed = {
  ready: Array<{ order_id: number; order_number: number; table_id: number; table_label: string; items: Array<{ id: number; name: string; quantity: number; station: string | null; modifiers: string[]; ready_at: string | null }> }>;
  pending: StaffOrder[];
  requests: Array<{ id: number; type: 'bill' | 'waiter'; status: string; table_id: number; table_label: string; session_id: number; created_at: string }>;
};

/** Mobile waiter portal: actionable tasks first, minimal trips back to the POS. */
export function WaiterPage() {
  const [tab, setTab] = useState<'tasks' | 'tables'>('tasks');
  const onEvent = useCallback((e: string) => {
    if (e === 'prep.updated' && 'vibrate' in navigator) navigator.vibrate?.(40);
  }, []);
  const connected = useRealtime(onEvent);
  const feed = useBranchQuery<Feed>(['waiter-feed'], '/waiter/feed', { refetchInterval: connected ? 20000 : 5000 });
  const tables = useBranchQuery<{ areas: Array<{ id: number; name: string }>; tables: LiveTable[] }>(['tables-live'], '/tables-live', { refetchInterval: connected ? 30000 : 6000 });
  const [tableId, setTableId] = useState<number | null>(null);
  const table = tables.data?.tables.find((t) => t.id === tableId) ?? null;
  const taskCount = (feed.data?.ready.length ?? 0) + (feed.data?.requests.length ?? 0) + (feed.data?.pending.length ?? 0);

  return (
    <div className="flex min-h-dvh flex-col pb-20">
      <AppBar title="Сервитьор" connected={connected} />
      <main className="mx-auto w-full max-w-2xl flex-1 p-3 sm:p-5">
        {tab === 'tasks' ? (
          feed.isLoading || !feed.data ? <div className="grid h-60 place-items-center"><Spinner /></div> : <Tasks feed={feed.data} onOpenTable={(id) => setTableId(id)} />
        ) : tables.data ? (
          <FloorMap tables={tables.data.tables} areas={tables.data.areas} selectedId={tableId} onSelect={(t) => setTableId(t.id)} compact />
        ) : (
          <div className="grid h-60 place-items-center"><Spinner /></div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-2xl grid-cols-2">
          {([['tasks', 'Задачи', ListChecks], ['tables', 'Маси', LayoutGrid]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold', tab === k ? 'text-accent' : 'text-muted')}>
              <I className="h-5 w-5" />
              {l}
              {k === 'tasks' && taskCount > 0 && <span className="tabular absolute right-[calc(50%-26px)] top-2 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">{taskCount}</span>}
            </button>
          ))}
        </div>
      </nav>

      <AnimatePresence>
        {table && tables.data && (
          <motion.div className="fixed inset-0 z-40 flex flex-col bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTableId(null)}>
            <motion.div className="mt-auto flex h-[90dvh] flex-col rounded-t-3xl border-t border-line bg-surface" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }} onClick={(e) => e.stopPropagation()}>
              <SessionPanel table={table} tables={tables.data.tables} onClose={() => setTableId(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tasks({ feed, onOpenTable }: { feed: Feed; onOpenTable: (tableId: number) => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const now = useNow(15000);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(k);
    try {
      await fn();
      toast.ok(ok);
      await qc.invalidateQueries({ queryKey: ['b', branchId] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  if (!feed.ready.length && !feed.requests.length && !feed.pending.length) {
    return <Empty icon={<Check className="h-5 w-5" />} title="Всичко е обслужено" text="Готовите ястия, повикванията и исканията за сметка ще се появят тук." />;
  }

  return (
    <div className="space-y-5">
      {feed.requests.length > 0 && (
        <Section title="Повиквания" count={feed.requests.length}>
          {feed.requests.map((r) => (
            <motion.div layout key={r.id} className={cx('flex items-center gap-3 rounded-2xl border p-3.5', r.type === 'bill' ? 'border-warn/40 bg-warn-soft' : 'border-accent/40 bg-accent-soft')}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg">{r.type === 'bill' ? <Receipt className="h-5 w-5 text-warn" /> : <BellRing className="h-5 w-5 text-accent" />}</div>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpenTable(r.table_id)}>
                <div className="text-[15px] font-semibold">{r.table_label}</div>
                <div className="text-[12.5px] text-muted">{r.type === 'bill' ? 'Иска сметката' : 'Вика сервитьор'} · преди {timeAgo(r.created_at, now)}</div>
              </button>
              {r.status === 'open' ? (
                <Button size="md" variant="secondary" loading={busy === 'ack' + r.id} onClick={() => run('ack' + r.id, () => mutate(`/requests/${r.id}`, 'PATCH', { status: 'acknowledged' }), 'Потвърдено')}>Идвам</Button>
              ) : (
                <Badge tone="info">Поето</Badge>
              )}
              {r.type === 'waiter' && <Button size="md" variant="ghost" onClick={() => run('done' + r.id, () => mutate(`/requests/${r.id}`, 'PATCH', { status: 'done' }), 'Готово')}>✓</Button>}
            </motion.div>
          ))}
        </Section>
      )}

      {feed.ready.length > 0 && (
        <Section title="Готови за сервиране" count={feed.ready.reduce((s, r) => s + r.items.length, 0)}>
          {feed.ready.map((r) => (
            <motion.div layout key={r.order_id} className="rounded-2xl border border-accent/40 bg-surface p-3.5 shadow-[0_0_30px_-12px_var(--accent)]">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => onOpenTable(r.table_id)} className="text-left">
                  <div className="text-[17px] font-bold">{r.table_label}</div>
                  <div className="tabular text-[12px] text-muted">Поръчка № {r.order_number}</div>
                </button>
                {can('orders.serve') && (
                  <Button size="lg" variant="ok" icon={<HandPlatter className="h-4 w-4" />} loading={busy === 'srv' + r.order_id} onClick={() => run('srv' + r.order_id, () => mutate(`/orders/${r.order_id}/serve`, 'POST', { item_ids: r.items.map((i) => i.id) }), `Сервирано на ${r.table_label}`)}>
                    Сервирано
                  </Button>
                )}
              </div>
              <ul className="mt-2.5 space-y-1">
                {r.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-[14px]">
                    <span className="tabular font-bold">{i.quantity}×</span>
                    <span className="min-w-0 flex-1 truncate">{i.name}{i.modifiers.length > 0 && <span className="text-muted"> · {i.modifiers.join(', ')}</span>}</span>
                    <span className="text-[11.5px] text-subtle">{i.station}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </Section>
      )}

      {feed.pending.length > 0 && (
        <Section title="Нови QR поръчки за потвърждение" count={feed.pending.length}>
          {feed.pending.map((o) => (
            <div key={o.id} className="rounded-2xl border border-warn/40 bg-surface p-3.5">
              <div className="flex items-center justify-between">
                <button onClick={() => onOpenTable(o.table_id)} className="text-left">
                  <div className="text-[16px] font-bold">{o.table_label}</div>
                  <div className="tabular text-[12px] text-muted">№ {o.number} · {timeAgo(o.created_at, now)}</div>
                </button>
                {can('orders.accept') && <Button variant="primary" loading={busy === 'acc' + o.id} onClick={() => run('acc' + o.id, () => mutate(`/orders/${o.id}/accept`, 'POST'), 'Поръчката е приета и изпратена')}>Приеми</Button>}
              </div>
              <ul className="mt-2 text-[13.5px] text-muted">
                {o.items.map((i) => <li key={i.id}>{i.quantity}× {i.name}</li>)}
              </ul>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <section>
    <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
      {title} <span className="tabular rounded-full bg-surface-3 px-2 text-[11px] text-fg">{count}</span>
    </h2>
    <div className="space-y-2">
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  </section>
);
