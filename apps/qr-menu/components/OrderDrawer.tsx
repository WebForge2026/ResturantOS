'use client';

import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatBgn, formatEur } from '@noar/api-client';
import type { AcceptMode } from '@noar/types';
import type { CartLine } from '@/lib/cart';
import { cartCount, cartTotal } from '@/lib/cart';
import { PlateArt } from './PlateArt';
import { useReducedMotion } from '@/lib/useMedia';

type Props = {
  open: boolean;
  onClose: () => void;
  tableLabel: string;
  lines: CartLine[];
  note: string;
  onNote: (v: string) => void;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  acceptMode: AcceptMode;
  showBgn: boolean;
  bgnRate: number;
};

/** Slide-over bottom sheet: itemized cart, notes, modifiers and REAL submission to Laravel. */
export function OrderDrawer(p: Props) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const total = cartTotal(p.lines);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', onKey);
    sheetRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [p.open, p]);

  useEffect(() => setConfirmClear(false), [p.open]);

  return (
    <AnimatePresence>
      {p.open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[80] bg-ink/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={p.onClose}
          />
          <motion.div
            key="sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Вашата поръчка • ${p.tableLabel}`}
            tabIndex={-1}
            className="card fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[88dvh] max-w-[640px] flex-col rounded-t-[32px] border-b-0 bg-paper outline-none"
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag={reduced ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) p.onClose();
            }}
          >
            <div aria-hidden className="hidden absolute inset-x-10 top-0 h-px" />
            <div className="cursor-grab touch-none px-5 pb-2 pt-3 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
              <div className="mx-auto h-1 w-10 rounded-full bg-ink/20" />
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-terra">Количка · {cartCount(p.lines)} арт.</div>
                  <h2 className="font-display text-[20px] font-semibold text-ink">
                    Вашата поръчка <span className="text-ink-mute">•</span> {p.tableLabel}
                  </h2>
                </div>
                <button onClick={p.onClose} className="grid h-10 w-10 place-items-center rounded-full border border-ink/10 text-ink-soft hover:text-ink" aria-label="Затвори">
                  ✕
                </button>
              </div>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5" data-lenis-prevent>
              {p.lines.length === 0 ? (
                <div className="py-14 text-center text-sm text-ink-mute">Количката е празна. Завъртете масата и изберете ястие.</div>
              ) : (
                <ul className="divide-y divide-ink/10">
                  <AnimatePresence initial={false}>
                    {p.lines.map((l) => (
                      <motion.li
                        key={l.key}
                        layout={!reduced}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex items-center gap-3 py-3.5"
                      >
                        <div className="h-12 w-12 shrink-0">
                          <PlateArt art={l.product.art} imageUrl={l.product.image_url} label={l.product.name} seed={l.product.id} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[14px] leading-snug font-semibold text-ink">{l.product.name}</div>
                          {l.modifierNames.length > 0 && <div className="truncate text-[12px] text-ink-mute">{l.modifierNames.join(' · ')}</div>}
                          <div className="tabular mt-0.5 text-[13px] text-ink-soft">{formatEur(l.unitCents * l.quantity)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-ink/10 bg-linen p-1">
                          <button aria-label={`Намали ${l.product.name}`} onClick={() => p.onDec(l.key)} className="grid h-9 w-8 place-items-center rounded-lg text-lg text-ink active:scale-90 hover:bg-sand">
                            −
                          </button>
                          <span className="tabular w-6 text-center text-sm font-semibold">{l.quantity}</span>
                          <button aria-label={`Увеличи ${l.product.name}`} onClick={() => p.onInc(l.key)} className="grid h-9 w-8 place-items-center rounded-lg text-lg text-ink active:scale-90 hover:bg-sand">
                            +
                          </button>
                        </div>
                        <button aria-label={`Премахни ${l.product.name}`} onClick={() => p.onRemove(l.key)} className="-mr-2 grid h-9 w-8 shrink-0 place-items-center rounded-lg text-ink-mute hover:text-terra">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                          </svg>
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              <label className="mt-3 block">
                <span className="text-[10px] uppercase tracking-[0.25em] text-ink-mute">Бележка към кухнята</span>
                <textarea
                  value={p.note}
                  onChange={(e) => p.onNote(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="Бележка към кухнята (напр. без лук, средно изпечено...)"
                  className="mt-2 w-full resize-none rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-[14px] text-ink placeholder:text-ink-mute focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass/30"
                />
              </label>
              <div className="h-3" />
            </div>

            <div className="border-t border-ink/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-mute">Обща сума (ориентировъчно)</span>
                <span className="text-right">
                  <span className="tabular block font-display text-[22px] font-semibold text-ink">{formatEur(total)}</span>
                  {p.showBgn && <span className="tabular block text-[11px] text-ink-mute">≈ {formatBgn(total, p.bgnRate)}</span>}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink-mute">Цените се потвърждават от сървъра при изпращане.</p>

              {p.error && (
                <div role="alert" className="mt-3 rounded-xl border border-terra/40 bg-terra/10 px-3 py-2 text-[13px] text-terra-deep">
                  {p.error}
                </div>
              )}

              <button
                onClick={p.onSubmit}
                disabled={p.submitting || p.lines.length === 0}
                className="relative mt-3 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-terra text-[15px] font-bold text-paper shadow-[0_12px_30px_-12px_rgba(180,85,47,0.8)] transition active:scale-[0.98] disabled:opacity-50"
              >
                {p.submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />}
                {p.submitting ? 'Изпращане…' : p.acceptMode === 'auto' ? 'Изпрати поръчката към кухнята' : 'Изпрати поръчката за потвърждение'}
              </button>
              {p.lines.length > 0 && (
                <button
                  onClick={() => (confirmClear ? (p.lines.forEach((l) => p.onRemove(l.key)), setConfirmClear(false)) : setConfirmClear(true))}
                  className="mt-2 w-full py-2 text-[12px] text-ink-mute hover:text-ink-soft"
                >
                  {confirmClear ? 'Потвърдете изчистването' : 'Изчисти количката'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
