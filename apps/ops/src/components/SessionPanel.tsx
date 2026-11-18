import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, BadgePercent, Ban, Check as CheckIcon, CreditCard, HandPlatter, Plus, Receipt, Scissors, Sparkles, Users, Merge } from 'lucide-react';
import { formatEur, mutate, type CheckDto, type LiveTable, type SessionDetail } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { ITEM_STATUS, ORDER_STATUS, clock, cx, parseEurInput, timeAgo } from '@/lib/format';
import { Badge, Button, Dialog, Empty, Field, Input, Segmented, Select, Spinner, toast, useNow } from './ui';
import { MenuPicker } from './MenuPicker';
import { CheckoutDialog } from './CheckoutDialog';

/** Right-hand panel of the POS (and the waiter's table sheet). */
export function SessionPanel({ table, tables, onClose }: { table: LiveTable; tables: LiveTable[]; onClose?: () => void }) {
  const can = useCan();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const sessionId = table.session?.id ?? null;
  const { data, isLoading } = useBranchQuery<SessionDetail>(['session', sessionId], `/sessions/${sessionId}`, { enabled: !!sessionId, refetchInterval: 15000 });
  const now = useNow(15000);
  const [picker, setPicker] = useState(false);
  const [payCheck, setPayCheck] = useState<CheckDto | null>(null);
  const [dialog, setDialog] = useState<null | 'transfer' | 'discount' | 'split' | { voidItem: number; name: string }>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.ok(ok);
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title={table.label} subtitle={`${table.seats} места · свободна`} onClose={onClose} />
        <Empty
          icon={<Users className="h-5 w-5" />}
          title="Масата е свободна"
          text="Отворете маса, за да въведете поръчка ръчно. Гостите могат да поръчат и през QR кода."
          action={
            can('orders.create') && (
              <Button variant="primary" loading={busy === 'open'} onClick={() => run('open', () => mutate('/sessions', 'POST', { table_id: table.id }), `${table.label} е отворена`)} icon={<Plus className="h-4 w-4" />}>
                Отвори маса
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title={table.label} onClose={onClose} />
        <div className="grid flex-1 place-items-center"><Spinner /></div>
      </div>
    );
  }

  const s = data.session;
  const checks = data.checks;
  const open = checks.filter((c) => c.status === 'open');
  const due = open.reduce((sum, c) => sum + c.due_cents, 0);
  const total = checks.reduce((sum, c) => sum + c.total_cents, 0);
  const pending = data.orders.filter((o) => o.status === 'pending');
  const readyCount = data.orders.flatMap((o) => o.items).filter((i) => i.status === 'ready').length;
  const accepting = s.status === 'open' || s.status === 'bill_requested';
  const freeTables = tables.filter((t) => t.status === 'available');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        title={s.table.label}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>Отворена {clock(s.opened_at)} · {timeAgo(s.opened_at, now)}</span>
            {s.status === 'bill_requested' && <Badge tone="warn" dot>Иска сметка</Badge>}
            {s.status === 'settled' && <Badge tone="ok" dot>Платена</Badge>}
            {data.requests.some((r) => r.type === 'waiter') && <Badge tone="accent" dot>Вика сервитьор</Badge>}
          </span>
        }
        onClose={onClose}
      />

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {pending.map((o) => (
          <div key={o.id} className="rounded-2xl border border-warn/40 bg-warn-soft p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-semibold">Нова QR поръчка № {o.number} чака потвърждение</div>
              <div className="flex gap-1.5">
                {can('orders.cancel') && <Button size="sm" variant="ghost" onClick={() => run('c' + o.id, () => mutate(`/orders/${o.id}/cancel`, 'POST', { reason: 'Отказана от персонала' }), 'Поръчката е отказана')}>Откажи</Button>}
                {can('orders.accept') && <Button size="sm" variant="primary" loading={busy === 'a' + o.id} onClick={() => run('a' + o.id, () => mutate(`/orders/${o.id}/accept`, 'POST'), `Поръчка № ${o.number} е приета`)}>Приеми</Button>}
              </div>
            </div>
          </div>
        ))}

        {data.orders.length === 0 && <Empty title="Няма поръчки" text="Добавете артикули или изчакайте QR поръчка." />}

        {data.orders.map((o) => {
          const ready = o.items.filter((i) => i.status === 'ready');
          return (
            <div key={o.id} className="rounded-2xl border border-line bg-surface-2/60">
              <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                <div className="flex items-center gap-2">
                  <span className="tabular text-[13.5px] font-semibold">№ {o.number}</span>
                  <Badge tone={ORDER_STATUS[o.status]?.tone}>{ORDER_STATUS[o.status]?.label ?? o.status}</Badge>
                  <span className="text-[11.5px] text-subtle">{o.source === 'qr' ? 'QR' : 'Персонал'} · {clock(o.created_at)}</span>
                </div>
                {ready.length > 0 && can('orders.serve') && (
                  <Button size="sm" variant="ok" icon={<HandPlatter className="h-3.5 w-3.5" />} loading={busy === 's' + o.id} onClick={() => run('s' + o.id, () => mutate(`/orders/${o.id}/serve`, 'POST'), 'Отбелязано като сервирано')}>
                    Сервирай {ready.length}
                  </Button>
                )}
              </div>
              {o.note && <div className="mx-3.5 mt-2 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[12px] text-warn">📝 {o.note}</div>}
              <ul className="px-3.5 py-2">
                {o.items.map((i) => (
                  <li key={i.id} className={cx('flex items-center gap-2 py-1 text-[13px]', i.status === 'cancelled' && 'line-through opacity-50')}>
                    <span className="tabular w-6 font-semibold">{i.quantity}×</span>
                    <span className="min-w-0 flex-1 truncate">
                      {i.name}
                      {i.modifiers.length > 0 && <span className="text-muted"> · {i.modifiers.join(', ')}</span>}
                    </span>
                    <Badge tone={ITEM_STATUS[i.status]?.tone}>{ITEM_STATUS[i.status]?.label}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {checks.map((c) => (
          <CheckCard key={c.id} check={c} multi={checks.length > 1} onPay={() => setPayCheck(c)} onVoid={(id, name) => setDialog({ voidItem: id, name })} canPay={can('payments.take')} canVoid={can('checks.void_item')} />
        ))}
      </div>

      <div className="border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[12px] text-muted">Дължимо{checks.length > 1 ? ` · ${checks.length} сметки` : ''}</div>
            <div className="tabular text-[26px] font-semibold tracking-tight">{formatEur(due)}</div>
          </div>
          <div className="text-right text-[12px] text-muted">Общо {formatEur(total)}{readyCount > 0 && <div className="font-semibold text-accent">{readyCount} готови за сервиране</div>}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {accepting && can('orders.create') && (
            <Button variant="secondary" className="col-span-2 h-12" icon={<Plus className="h-4 w-4" />} onClick={() => setPicker(true)}>Добави</Button>
          )}
          {open.length > 0 && can('payments.take') && due > 0 && (
            <Button variant="primary" className="col-span-2 h-12" icon={<CreditCard className="h-4 w-4" />} onClick={() => setPayCheck(open[0])}>Плащане</Button>
          )}
          {s.status === 'settled' && can('tables.clear') && (
            <Button variant="ok" className="col-span-4 h-12" icon={<Sparkles className="h-4 w-4" />} loading={busy === 'clear'} onClick={() => run('clear', () => mutate(`/sessions/${s.id}/clear`, 'POST'), `${s.table.label} е освободена`).then(onClose)}>
              Освободи масата
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {s.status === 'open' && <Button size="sm" variant="ghost" icon={<Receipt className="h-3.5 w-3.5" />} onClick={() => run('bill', () => mutate(`/sessions/${s.id}/request-bill`, 'POST'), 'Отбелязано: иска сметка')}>Сметка</Button>}
          {can('orders.transfer') && accepting && <Button size="sm" variant="ghost" icon={<ArrowRightLeft className="h-3.5 w-3.5" />} onClick={() => setDialog('transfer')}>Премести</Button>}
          {can('checks.split') && open.length > 0 && <Button size="sm" variant="ghost" icon={<Scissors className="h-3.5 w-3.5" />} onClick={() => setDialog('split')}>Раздели</Button>}
          {can('checks.discount') && open.length > 0 && <Button size="sm" variant="ghost" icon={<BadgePercent className="h-3.5 w-3.5" />} onClick={() => setDialog('discount')}>Отстъпка</Button>}
        </div>
      </div>

      <MenuPicker open={picker} onClose={() => setPicker(false)} sessionId={s.id} tableLabel={s.table.label} />
      <CheckoutDialog open={!!payCheck} onClose={() => setPayCheck(null)} check={payCheck ? checks.find((c) => c.id === payCheck.id) ?? payCheck : null} tableLabel={s.table.label} />
      <TransferDialog open={dialog === 'transfer'} onClose={() => setDialog(null)} tables={freeTables} onConfirm={(id) => run('transfer', () => mutate(`/sessions/${s.id}/transfer`, 'POST', { table_id: id }), 'Масата е преместена').then(() => { setDialog(null); onClose?.(); })} />
      <DiscountDialog open={dialog === 'discount'} onClose={() => setDialog(null)} checks={open} onConfirm={(checkId, body) => run('disc', () => mutate(`/checks/${checkId}/discount`, 'POST', body), 'Отстъпката е приложена').then(() => setDialog(null))} />
      <SplitDialog open={dialog === 'split'} onClose={() => setDialog(null)} checks={open} run={run} />
      <VoidDialog target={typeof dialog === 'object' && dialog !== null && 'voidItem' in dialog ? dialog : null} onClose={() => setDialog(null)} onConfirm={(id, reason) => run('void', () => mutate(`/check-items/${id}/void`, 'POST', { reason }), 'Артикулът е анулиран').then(() => setDialog(null))} />
    </div>
  );
}

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle?: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
      <div className="min-w-0">
        <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-2" aria-label="Затвори">✕</button>
      )}
    </div>
  );
}

function CheckCard({ check, multi, onPay, onVoid, canPay, canVoid }: { check: CheckDto; multi: boolean; onPay: () => void; onVoid: (id: number, name: string) => void; canPay: boolean; canVoid: boolean }) {
  return (
    <div className="rounded-2xl border border-line">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Receipt className="h-4 w-4 text-muted" /> Сметка {multi ? `#${check.seq}` : ''}
          <Badge tone={check.status === 'settled' ? 'ok' : 'neutral'}>{check.status === 'settled' ? 'Платена' : 'Отворена'}</Badge>
        </div>
        {multi && check.status === 'open' && canPay && <Button size="sm" variant="secondary" onClick={onPay}>Плати #{check.seq}</Button>}
      </div>
      <ul className="px-3.5 py-2 text-[13px]">
        {check.items.map((i) => (
          <li key={i.id} className={cx('group flex items-center gap-2 py-1', i.voided && 'text-subtle line-through')}>
            <span className="tabular w-6">{i.quantity}×</span>
            <span className="min-w-0 flex-1 truncate">{i.name}</span>
            {i.paid_cents > 0 && !i.voided && <CheckIcon className="h-3.5 w-3.5 text-ok" aria-label="платено" />}
            <span className="tabular">{formatEur(i.total_cents)}</span>
            {canVoid && check.status === 'open' && !i.voided && i.paid_cents === 0 && (
              <button onClick={() => onVoid(i.id, i.name)} className="grid h-6 w-6 place-items-center rounded-md text-subtle opacity-60 hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label={`Анулирай ${i.name}`}>
                <Ban className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-0.5 border-t border-line px-3.5 py-2.5 text-[12.5px]">
        {check.discount_cents > 0 && <Row label={`Отстъпка (${check.discount_reason ?? ''})`} value={`−${formatEur(check.discount_cents)}`} />}
        {check.service_charge_cents > 0 && <Row label="Такса обслужване" value={formatEur(check.service_charge_cents)} />}
        <Row label="Общо" value={formatEur(check.total_cents)} strong />
        {check.paid_cents > 0 && <Row label="Платено" value={formatEur(check.paid_cents)} />}
        {check.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-[11.5px] text-subtle">
            <span>{p.method === 'cash' ? 'В брой' : 'Карта'} · {p.reference} · {clock(p.created_at)}</span>
            <span className="tabular">{formatEur(p.amount_cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={cx('flex justify-between', strong ? 'font-semibold' : 'text-muted')}>
    <span>{label}</span>
    <span className="tabular">{value}</span>
  </div>
);

function TransferDialog({ open, onClose, tables, onConfirm }: { open: boolean; onClose: () => void; tables: LiveTable[]; onConfirm: (id: number) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Преместване на маса" subtitle="Изберете свободна маса" size="sm">
      {tables.length === 0 ? <Empty title="Няма свободни маси" /> : (
        <div className="grid grid-cols-4 gap-2">
          {tables.map((t) => (
            <button key={t.id} onClick={() => onConfirm(t.id)} className="tabular h-14 rounded-xl border border-line text-[15px] font-semibold hover:border-accent hover:bg-accent-soft">
              {String(t.number).padStart(2, '0')}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function DiscountDialog({ open, onClose, checks, onConfirm }: { open: boolean; onClose: () => void; checks: CheckDto[]; onConfirm: (checkId: number, body: { type: string; value: number; reason: string }) => void }) {
  const [type, setType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [reason, setReason] = useState('');
  const [checkId, setCheckId] = useState<number | null>(null);
  const target = checkId ?? checks[0]?.id;
  const v = type === 'percent' ? Number(value) : parseEurInput(value);
  const valid = !!target && v !== null && Number.isFinite(v) && v >= 0 && reason.trim().length > 1;
  return (
    <Dialog open={open} onClose={onClose} title="Отстъпка" subtitle="Изисква право за отстъпки · записва се в одита" size="sm"
      footer={<Button variant="primary" className="w-full" disabled={!valid} onClick={() => target && v !== null && onConfirm(target, { type, value: Math.round(v), reason })}>Приложи</Button>}>
      <div className="space-y-4">
        {checks.length > 1 && (
          <Field label="Сметка"><Select value={target} onChange={(e) => setCheckId(Number(e.target.value))}>{checks.map((c) => <option key={c.id} value={c.id}>Сметка #{c.seq} · {formatEur(c.total_cents)}</option>)}</Select></Field>
        )}
        <Segmented value={type} onChange={setType} options={[{ value: 'percent', label: 'Процент' }, { value: 'amount', label: 'Сума (€)' }]} />
        <Field label={type === 'percent' ? 'Процент (0–100)' : 'Сума в евро'}><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Причина"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="напр. редовен клиент" /></Field>
      </div>
    </Dialog>
  );
}

function SplitDialog({ open, onClose, checks, run }: { open: boolean; onClose: () => void; checks: CheckDto[]; run: (k: string, fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [sel, setSel] = useState<number[]>([]);
  const source = checks[0];
  if (!source) return null;
  return (
    <Dialog open={open} onClose={() => { setSel([]); onClose(); }} title="Разделяне на сметка" subtitle="Изберете артикули за нова сметка" size="md"
      footer={
        <div className="flex gap-2">
          {checks.length > 1 && (
            <Button variant="secondary" icon={<Merge className="h-4 w-4" />} onClick={() => run('merge', () => mutate(`/checks/${checks[0].id}/merge`, 'POST', { source_check_id: checks[1].id }), 'Сметките са обединени').then(onClose)}>
              Обедини #{checks[1].seq} → #{checks[0].seq}
            </Button>
          )}
          <Button variant="primary" className="flex-1" disabled={sel.length === 0} onClick={() => run('split', () => mutate(`/checks/${source.id}/split`, 'POST', { check_item_ids: sel }), 'Създадена е нова сметка').then(() => { setSel([]); onClose(); })}>
            Нова сметка ({sel.length})
          </Button>
        </div>
      }>
      <div className="space-y-1.5">
        {source.items.filter((i) => !i.voided).map((i) => {
          const on = sel.includes(i.id);
          return (
            <button key={i.id} onClick={() => setSel((c) => (on ? c.filter((x) => x !== i.id) : [...c, i.id]))} className={cx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13.5px]', on ? 'border-accent bg-accent-soft' : 'border-line')}>
              <span className={cx('grid h-5 w-5 place-items-center rounded-md border text-[11px]', on ? 'border-accent bg-accent text-white' : 'border-line-strong')}>{on && '✓'}</span>
              <span className="flex-1 truncate">{i.quantity}× {i.name}</span>
              <span className="tabular">{formatEur(i.total_cents)}</span>
            </button>
          );
        })}
        <p className="pt-1 text-[12px] text-subtle">Сметка с плащания или отстъпка не може да се разделя — използвайте „Плащане по артикули“.</p>
      </div>
    </Dialog>
  );
}

function VoidDialog({ target, onClose, onConfirm }: { target: { voidItem: number; name: string } | null; onClose: () => void; onConfirm: (id: number, reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={!!target} onClose={onClose} title="Анулиране на артикул" subtitle={target?.name} size="sm"
      footer={<Button variant="danger" className="w-full" disabled={reason.trim().length < 2} onClick={() => target && onConfirm(target.voidItem, reason)}>Анулирай</Button>}>
      <Field label="Причина" hint="Ако ястието не е започнато, приготвянето също се отказва и складовата резервация се освобождава.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
