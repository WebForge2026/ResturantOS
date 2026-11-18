import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Printer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { bApi, formatBgn, formatEur, mutate, type CheckDto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx, parseEurInput } from '@/lib/format';
import { Badge, Button, Dialog, Field, Input, Segmented, toast } from './ui';

type Mode = 'full' | 'amount' | 'items';

/** SIMULATED payment (cash/card), with split by items or by amount. Server is authoritative. */
export function CheckoutDialog({ open, onClose, check, tableLabel }: { open: boolean; onClose: () => void; check: CheckDto | null; tableLabel: string }) {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [mode, setMode] = useState<Mode>('full');
  const [method, setMethod] = useState<'cash' | 'card'>('card');
  const [amount, setAmount] = useState('');
  const [tendered, setTendered] = useState('');
  const [tip, setTip] = useState('');
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ change: number; reference: string; settled: boolean } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (open) {
      setMode('full');
      setMethod('card');
      setAmount('');
      setTendered('');
      setTip('');
      setItemIds([]);
      setResult(null);
    }
  }, [open, check?.id]);

  const unpaidItems = useMemo(() => (check?.items ?? []).filter((i) => !i.voided && i.paid_cents < i.total_cents), [check]);
  if (!check) return null;

  const due = check.due_cents;
  const itemsSum = unpaidItems.filter((i) => itemIds.includes(i.id)).reduce((s, i) => s + i.total_cents - i.paid_cents, 0);
  const payAmount = mode === 'full' ? due : mode === 'amount' ? parseEurInput(amount) ?? 0 : Math.min(itemsSum, due);
  const tipCents = parseEurInput(tip) ?? 0;
  const tenderedCents = method === 'cash' ? parseEurInput(tendered) ?? payAmount + tipCents : null;
  const change = tenderedCents !== null ? tenderedCents - payAmount - tipCents : 0;
  const valid = payAmount > 0 && payAmount <= due && (method === 'card' || change >= 0);

  const pay = async () => {
    setBusy(true);
    try {
      const res = await mutate<{ payment: { change_cents: number; reference: string }; check: CheckDto }>(
        `/checks/${check.id}/payments`,
        'POST',
        {
          method,
          mode,
          amount_cents: mode === 'amount' ? payAmount : undefined,
          check_item_ids: mode === 'items' ? itemIds : undefined,
          tendered_cents: method === 'cash' ? tenderedCents : undefined,
          tip_cents: tipCents || undefined,
        },
        true,
      );
      setResult({ change: res.payment.change_cents, reference: res.payment.reference, settled: res.check.status === 'settled' });
      toast.ok(res.check.status === 'settled' ? `Сметката на ${tableLabel} е платена` : `Плащането е записано. Остават ${formatEur(res.check.due_cents)}`);
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async () => {
    try {
      setReceipt(await bApi<ReceiptData>(`/checks/${check.id}/receipt`));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={`Плащане · ${tableLabel}`}
        subtitle={<span className="flex items-center gap-2">Сметка #{check.seq} <Badge tone="warn">Симулирано плащане</Badge></span>}
        size="lg"
        footer={
          result ? (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={openReceipt}>Разписка</Button>
              <Button variant="primary" className="flex-1" onClick={result.settled ? onClose : () => setResult(null)}>
                {result.settled ? 'Готово' : 'Следващо плащане'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={openReceipt}>Преглед</Button>
              <Button variant="primary" size="lg" className="flex-1" disabled={!valid} loading={busy} onClick={pay}>
                Плати {formatEur(payAmount + tipCents)}
              </Button>
            </div>
          )
        }
      >
        {result ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-2xl text-ok">✓</div>
            <div className="mt-3 text-lg font-semibold">{result.settled ? 'Сметката е платена' : 'Частично плащане е записано'}</div>
            {method === 'cash' && <div className="tabular mt-1 text-[15px]">Ресто: <b>{formatEur(result.change)}</b></div>}
            <div className="mt-1 font-mono text-[12px] text-muted">Референция {result.reference} · симулирано</div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-4 text-center">
              <div><div className="text-[12px] text-muted">Общо</div><div className="tabular text-lg font-semibold">{formatEur(check.total_cents)}</div></div>
              <div><div className="text-[12px] text-muted">Платено</div><div className="tabular text-lg font-semibold text-ok">{formatEur(check.paid_cents)}</div></div>
              <div><div className="text-[12px] text-muted">Дължимо</div><div className="tabular text-lg font-semibold text-accent">{formatEur(due)}</div><div className="tabular text-[11px] text-subtle">{formatBgn(due)}</div></div>
            </div>

            <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: 'full', label: 'Цялата сума' }, { value: 'items', label: 'По артикули' }, { value: 'amount', label: 'По сума' }]} />

            {mode === 'items' && (
              <div className="space-y-1.5">
                {unpaidItems.map((i) => {
                  const on = itemIds.includes(i.id);
                  return (
                    <button key={i.id} onClick={() => setItemIds((c) => (on ? c.filter((x) => x !== i.id) : [...c, i.id]))} className={cx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[13.5px]', on ? 'border-accent bg-accent-soft' : 'border-line')}>
                      <span className={cx('grid h-5 w-5 place-items-center rounded-md border text-[11px]', on ? 'border-accent bg-accent text-white' : 'border-line-strong')}>{on && '✓'}</span>
                      <span className="flex-1 truncate">{i.quantity}× {i.name}</span>
                      <span className="tabular">{formatEur(i.total_cents - i.paid_cents)}</span>
                    </button>
                  );
                })}
                <p className="text-[12px] text-subtle">Отстъпки и такса обслужване се уреждат с последното плащане.</p>
              </div>
            )}
            {mode === 'amount' && (
              <Field label="Сума за плащане (€)">
                <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(due / 100).toFixed(2)} autoFocus />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-2">
              {(['card', 'cash'] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)} className={cx('flex h-14 items-center justify-center gap-2 rounded-2xl border text-[14px] font-semibold', method === m ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
                  {m === 'card' ? <CreditCard className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
                  {m === 'card' ? 'Карта (симул.)' : 'В брой'}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {method === 'cash' && (
                <Field label="Получени (€)" hint={change >= 0 ? `Ресто: ${formatEur(change)}` : 'Недостатъчна сума'}>
                  <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={((payAmount + tipCents) / 100).toFixed(2)} />
                  <div className="mt-2 flex gap-1.5">
                    {[payAmount + tipCents, Math.ceil((payAmount + tipCents) / 1000) * 1000, Math.ceil((payAmount + tipCents) / 5000) * 5000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                      <button key={v} onClick={() => setTendered((v / 100).toFixed(2))} className="tabular h-8 rounded-lg bg-surface-2 px-2.5 text-[12px] font-semibold hover:bg-surface-3">{formatEur(v)}</button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Бакшиш (€)">
                <Input inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0,00" />
              </Field>
            </div>
            <p className="text-[12px] text-subtle">Демо: не се осъществява връзка с банка, ПОС терминал или фискално устройство.</p>
          </div>
        )}
      </Dialog>
      <ReceiptDialog data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

type ReceiptData = { restaurant: { name: string; address: string | null; city: string | null; phone: string | null }; table: string; check: CheckDto; printed_at: string; disclaimer: string };

function ReceiptDialog({ data, onClose }: { data: ReceiptData | null; onClose: () => void }) {
  return (
    <Dialog open={!!data} onClose={onClose} title="Преглед на разписка" size="sm" footer={<Button className="w-full" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Печат</Button>}>
      {data && (
        <div className="mx-auto max-w-xs rounded-xl bg-white p-5 font-mono text-[12px] leading-relaxed text-black">
          <div className="text-center font-bold">{data.restaurant.name}</div>
          <div className="text-center">{[data.restaurant.address, data.restaurant.city].filter(Boolean).join(', ')}</div>
          <div className="my-2 border-t border-dashed border-black/40" />
          <div className="flex justify-between"><span>{data.table}</span><span>{data.printed_at}</span></div>
          <div className="my-2 border-t border-dashed border-black/40" />
          {data.check.items.filter((i) => !i.voided).map((i) => (
            <div key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.quantity}× {i.name}</span><span>{(i.total_cents / 100).toFixed(2)}</span></div>
          ))}
          <div className="my-2 border-t border-dashed border-black/40" />
          {data.check.discount_cents > 0 && <div className="flex justify-between"><span>Отстъпка</span><span>-{(data.check.discount_cents / 100).toFixed(2)}</span></div>}
          {data.check.service_charge_cents > 0 && <div className="flex justify-between"><span>Обслужване</span><span>{(data.check.service_charge_cents / 100).toFixed(2)}</span></div>}
          <div className="flex justify-between font-bold"><span>ОБЩО EUR</span><span>{(data.check.total_cents / 100).toFixed(2)}</span></div>
          {data.check.vat_breakdown.map((v) => (
            <div key={v.rate_bps} className="flex justify-between"><span>в т.ч. ДДС {v.rate_bps / 100}%</span><span>{(v.vat_cents / 100).toFixed(2)}</span></div>
          ))}
          <div className="flex justify-between"><span>Платено</span><span>{(data.check.paid_cents / 100).toFixed(2)}</span></div>
          <div className="my-2 border-t border-dashed border-black/40" />
          <div className="text-center text-[10.5px]">{data.disclaimer}</div>
        </div>
      )}
    </Dialog>
  );
}
