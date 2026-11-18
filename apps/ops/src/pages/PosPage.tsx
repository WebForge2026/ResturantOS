import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { formatEur, mutate, type LiveTable } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { useRealtime } from '@/lib/realtime';
import { parseEurInput, clock } from '@/lib/format';
import { AppBar } from '@/components/AppBar';
import { FloorMap } from '@/components/FloorMap';
import { SessionPanel } from '@/components/SessionPanel';
import { Button, Card, Dialog, Field, Input, Spinner, toast } from '@/components/ui';

type TablesData = { areas: Array<{ id: number; name: string }>; tables: LiveTable[] };

export function PosPage() {
  const onEvent = useCallback((e: string, p: Record<string, unknown>) => {
    if (e === 'order.created') toast.info(`Нова поръчка${p.table_id ? '' : ''}`);
    if (e === 'request.created') toast.info(p.type === 'bill' ? 'Маса иска сметка' : 'Маса вика сервитьор');
  }, []);
  const connected = useRealtime(onEvent);
  const { data, isLoading } = useBranchQuery<TablesData>(['tables-live'], '/tables-live', { refetchInterval: connected ? 30000 : 5000 });
  const [selected, setSelected] = useState<number | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const table = data?.tables.find((t) => t.id === selected) ?? null;

  // keyboard: Esc closes, digits jump to table number
  useEffect(() => {
    let buf = '';
    let timer: ReturnType<typeof setTimeout>;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]')) return;
      if (e.key === 'Escape') setSelected(null);
      if (/^\d$/.test(e.key) && data) {
        buf += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const t = data.tables.find((x) => x.number === Number(buf));
          if (t) setSelected(t.id);
          buf = '';
        }, 450);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [data]);

  return (
    <div className="flex h-dvh flex-col">
      <AppBar title="POS" connected={connected}>
        <ShiftWidget />
      </AppBar>
      {isLoading || !data ? (
        <div className="grid flex-1 place-items-center"><Spinner /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <FloorMap tables={data.tables} areas={data.areas} selectedId={selected} onSelect={(t) => setSelected(t.id)} />
            <p className="mt-4 hidden text-[12px] text-subtle lg:block">Съвет: въведете номер на маса от клавиатурата, за да я отворите. Esc затваря панела.</p>
          </main>
          {wide && (
            <aside className="w-[420px] shrink-0 border-l border-line bg-surface xl:w-[460px]">
              {table ? (
                <SessionPanel key={table.id} table={table} tables={data.tables} onClose={() => setSelected(null)} />
              ) : (
                <div className="grid h-full place-items-center px-8 text-center text-[13.5px] text-muted">Изберете маса от плана, за да видите поръчките и сметката.</div>
              )}
            </aside>
          )}
        </div>
      )}
      {!wide && table && data && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/50" onClick={() => setSelected(null)}>
          <div className="mt-auto flex h-[88dvh] flex-col rounded-t-3xl border-t border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            <SessionPanel key={table.id} table={table} tables={data.tables} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

type Shift = { id: number; status: string; opened_by: string | null; opened_at: string; opening_float_cents: number; cash_sales_cents: number; card_sales_cents: number; tips_cents: number; payments_count: number; expected_cash_cents: number; counted_cash_cents: number | null; difference_cents: number | null };

function ShiftWidget() {
  const can = useCan();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const { data } = useBranchQuery<{ shift: Shift | null }>(['shift'], '/shifts/current');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('200');
  const [busy, setBusy] = useState(false);
  const shift = data?.shift;

  const act = async () => {
    const cents = parseEurInput(amount);
    if (cents === null) return;
    setBusy(true);
    try {
      if (shift) {
        const r = await mutate<{ shift: Shift }>(`/shifts/${shift.id}/close`, 'POST', { counted_cash_cents: cents });
        toast.ok(`Смяната е затворена. Разлика: ${formatEur(r.shift.difference_cents ?? 0)}`);
      } else {
        await mutate('/shifts', 'POST', { opening_float_cents: cents });
        toast.ok('Касовата смяна е отворена');
      }
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!can('checks.view')) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="mr-1 hidden h-9 items-center gap-2 rounded-xl border border-line px-3 text-[12.5px] font-semibold sm:flex">
        <Wallet className="h-4 w-4 text-muted" />
        {shift ? <span>Смяна от {clock(shift.opened_at)}</span> : <span className="text-warn">Няма отворена смяна</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={shift ? 'Затваряне на смяна' : 'Отваряне на касова смяна'} size="sm"
        footer={can('shifts.manage') ? <Button variant="primary" className="w-full" loading={busy} onClick={act}>{shift ? 'Затвори и сравни' : 'Отвори смяна'}</Button> : undefined}>
        {shift && (
          <Card className="mb-4 space-y-1.5 p-4 text-[13px]">
            <Line l="Начална наличност" v={formatEur(shift.opening_float_cents)} />
            <Line l="Продажби в брой" v={formatEur(shift.cash_sales_cents)} />
            <Line l="Продажби с карта (симул.)" v={formatEur(shift.card_sales_cents)} />
            <Line l="Бакшиши" v={formatEur(shift.tips_cents)} />
            <Line l="Плащания" v={String(shift.payments_count)} />
            <div className="border-t border-line pt-1.5"><Line l="Очаквани пари в брой" v={formatEur(shift.expected_cash_cents)} strong /></div>
          </Card>
        )}
        {can('shifts.manage') ? (
          <Field label={shift ? 'Преброени пари в брой (€)' : 'Начална наличност в касата (€)'}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        ) : <p className="text-[13px] text-muted">Нямате право да управлявате смени.</p>}
      </Dialog>
    </>
  );
}

const Line = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
  <div className={`flex justify-between ${strong ? 'font-semibold' : 'text-muted'}`}><span>{l}</span><span className="tabular text-fg">{v}</span></div>
);
