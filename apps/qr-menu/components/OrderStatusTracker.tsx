'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { formatEur } from '@noar/api-client';
import type { PublicOrder, PublicSessionState } from '@noar/types';
import { ITEM_STATUS_LABEL, ORDER_STATUS_LABEL, ORDER_STEPS, stepIndex } from '@/lib/labels';
import { useReducedMotion } from '@/lib/useMedia';

type Props = {
  session: PublicSessionState | null;
  live: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOrderMore: () => void;
  onRequest: (type: 'bill' | 'waiter') => Promise<void>;
};

const STEP_SHORT = ['Получена', 'Приета', 'Приготвя се', 'Частично', 'Готова', 'Сервирана'];

const tone = (status: PublicOrder['status']) =>
  status === 'ready' || status === 'partially_ready'
    ? 'bg-crimson shadow-[0_0_10px_rgba(255,42,42,0.9)]'
    : status === 'served' || status === 'completed'
      ? 'bg-chrome-300'
      : status === 'cancelled'
        ? 'bg-chrome-700'
        : 'bg-amber-400';

/** Compact top status pill + expandable live tracker (server statuses only, never simulated). */
export function OrderStatusTracker({ session, live, open, onOpenChange, onOrderMore, onRequest }: Props) {
  const reduced = useReducedMotion();
  const latest = session?.orders.at(-1);
  const [busy, setBusy] = useState<'bill' | 'waiter' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const hasBill = session?.open_requests.some((r) => r.type === 'bill') || session?.status === 'bill_requested';
  const hasWaiter = session?.open_requests.some((r) => r.type === 'waiter');

  if (!session || !latest) return null;

  const request = async (type: 'bill' | 'waiter') => {
    setBusy(type);
    setMsg(null);
    try {
      await onRequest(type);
      setMsg(type === 'bill' ? 'Сметката е поискана. Сервитьорът идва.' : 'Сервитьорът е повикан.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Грешка при изпращане');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <motion.button
        initial={reduced ? false : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={() => onOpenChange(true)}
        className="glass crimson-rim fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex h-10 -translate-x-1/2 items-center gap-2.5 rounded-full pl-3 pr-4 text-[12.5px] font-semibold text-white"
        aria-label={`Поръчка № ${latest.number}: ${ORDER_STATUS_LABEL[latest.status]}. Отвори статуса.`}
      >
        <span className="relative flex h-2.5 w-2.5">
          {!reduced && latest.status !== 'served' && latest.status !== 'completed' && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tone(latest.status)}`} />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone(latest.status)}`} />
        </span>
        <span className="tabular font-mono text-[11px] text-chrome-500">№ {latest.number}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={latest.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {ORDER_STATUS_LABEL[latest.status]}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onOpenChange(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Статус на поръчките"
              className="glass fixed inset-x-0 top-0 z-[90] mx-auto max-h-[86dvh] max-w-[640px] overflow-y-auto rounded-b-[32px] bg-[#0b0b0f]/90 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]"
              initial={reduced ? { opacity: 0 } : { y: '-100%' }}
              animate={reduced ? { opacity: 1 } : { y: 0 }}
              exit={reduced ? { opacity: 0 } : { y: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              data-lenis-prevent
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-crimson">
                    {session.table.label.replace('Маса', 'Маса №')} · {live ? 'на живо' : 'опресняване'}
                  </div>
                  <h2 className="font-display text-[20px] font-semibold">Вашите поръчки</h2>
                </div>
                <button onClick={() => onOpenChange(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-chrome-300" aria-label="Затвори">
                  ✕
                </button>
              </div>

              <ul className="mt-4 space-y-3">
                {[...session.orders].reverse().map((o) => (
                  <li key={o.public_id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="tabular font-display text-[15px] font-semibold">Поръчка № {o.number}</span>
                      <span className="text-[12px] font-semibold text-white">{ORDER_STATUS_LABEL[o.status]}</span>
                    </div>
                    {o.status !== 'cancelled' && (
                      <div className="mt-3 grid grid-cols-6 gap-1" aria-hidden>
                        {ORDER_STEPS.map((s, i) => {
                          const idx = stepIndex(o.status);
                          return (
                            <div key={s}>
                              <div className={`h-1 rounded-full transition-colors duration-500 ${i <= idx ? 'bg-crimson shadow-[0_0_6px_rgba(255,42,42,0.7)]' : 'bg-white/10'}`} />
                              <div className={`mt-1 truncate text-[8.5px] ${i === idx ? 'text-white' : 'text-chrome-700'}`}>{STEP_SHORT[i]}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate text-chrome-300">
                            <span className="tabular text-white">{it.quantity}×</span> {it.name}
                            {it.modifiers.length > 0 && <span className="text-chrome-500"> · {it.modifiers.join(', ')}</span>}
                          </span>
                          <span className={`shrink-0 text-[11px] font-semibold ${it.status === 'ready' ? 'text-crimson' : it.status === 'served' ? 'text-chrome-300' : 'text-chrome-500'}`}>
                            {ITEM_STATUS_LABEL[it.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              {session.check && (
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                  <span className="text-[13px] text-chrome-500">Сметка на масата</span>
                  <span className="tabular font-display text-[17px] font-semibold">
                    {session.check.due_cents > 0 ? formatEur(session.check.due_cents) : 'Платена'}
                  </span>
                </div>
              )}

              {msg && (
                <div role="status" className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-chrome-300">
                  {msg}
                </div>
              )}

              {session.status === 'open' || session.status === 'bill_requested' ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={onOrderMore}
                    className="col-span-2 h-13 rounded-2xl bg-gradient-to-b from-crimson to-crimson-deep py-4 text-[15px] font-bold text-white shadow-[0_10px_40px_-10px_rgba(255,42,42,0.8)] active:scale-[0.98]"
                  >
                    Поръчай още
                  </button>
                  <button disabled={busy !== null || hasBill} onClick={() => request('bill')} className="h-12 rounded-2xl border border-white/15 text-[13px] font-semibold text-white disabled:opacity-50">
                    {hasBill ? 'Сметката е поискана' : busy === 'bill' ? 'Изпращане…' : 'Поискай сметката'}
                  </button>
                  <button disabled={busy !== null || hasWaiter} onClick={() => request('waiter')} className="h-12 rounded-2xl border border-white/15 text-[13px] font-semibold text-white disabled:opacity-50">
                    {hasWaiter ? 'Сервитьорът идва' : busy === 'waiter' ? 'Изпращане…' : 'Повикай сервитьор'}
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-center text-[13px] text-chrome-500">Сметката е платена. Благодарим, че избрахте NOAR!</p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
