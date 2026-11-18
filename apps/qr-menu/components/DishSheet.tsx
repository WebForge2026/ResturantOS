'use client';

import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { PublicProduct } from '@noar/types';
import { formatBgn, formatEur } from '@noar/api-client';
import type { CartLine } from '@/lib/cart';
import { lineKey } from '@/lib/cart';
import { useReducedMotion } from '@/lib/useMedia';
import { AddControl, defaultModifiers } from './MenuList';
import { PlateArt } from './PlateArt';

/** Dish detail bottom sheet: big photo, description, options, add to order. */
export function DishSheet({
  product,
  onClose,
  showBgn,
  bgnRate,
  lines,
  onAdd,
  onInc,
  onDec,
}: {
  product: PublicProduct | null;
  onClose: () => void;
  showBgn: boolean;
  bgnRate: number;
  lines: CartLine[];
  onAdd: (p: PublicProduct, modifierIds: number[]) => void;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  useEffect(() => {
    if (!product) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.documentElement.style.overflow = '';
    };
  }, [product, onClose]);

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-[80] bg-ink/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92dvh] max-w-[620px] flex-col overflow-hidden rounded-t-[32px] bg-paper shadow-2xl"
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag={reduced ? false : 'y'}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && onClose()}
          >
            <div className="relative shrink-0 touch-none" onPointerDown={(e) => controls.start(e)}>
              <div className="aspect-[4/3] w-full overflow-hidden bg-sand">
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="mx-auto h-full max-w-[70%] p-6"><PlateArt art={product.art} imageUrl={null} label={product.name} seed={product.id} /></div>
                )}
              </div>
              <div className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-paper/80 shadow" />
              <button onClick={onClose} aria-label="Затвори" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-paper/90 text-ink shadow-md backdrop-blur">✕</button>
            </div>
            <SheetBody key={product.id} product={product} showBgn={showBgn} bgnRate={bgnRate} lines={lines} onAdd={onAdd} onInc={onInc} onDec={onDec} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SheetBody({ product, showBgn, bgnRate, lines, onAdd, onInc, onDec }: { product: PublicProduct; showBgn: boolean; bgnRate: number; lines: CartLine[]; onAdd: (p: PublicProduct, m: number[]) => void; onInc: (k: string) => void; onDec: (k: string) => void }) {
  const defaults = useMemo(() => defaultModifiers(product), [product]);
  const [selected, setSelected] = useState<number[]>(defaults);
  const unit = product.price_cents + product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.price_delta_cents, 0);
  const key = lineKey(product.id, selected);
  const qty = lines.find((l) => l.key === key)?.quantity ?? 0;

  const toggle = (groupId: number, optionId: number) => {
    const g = product.modifier_groups.find((x) => x.id === groupId)!;
    const ids = g.options.map((o) => o.id);
    setSelected((cur) => {
      if (g.max === 1) return [...cur.filter((id) => !ids.includes(id)), optionId];
      if (cur.includes(optionId)) {
        const rest = cur.filter((id) => id !== optionId);
        return rest.filter((id) => ids.includes(id)).length < g.min ? cur : rest;
      }
      return cur.filter((id) => ids.includes(id)).length >= g.max ? cur : [...cur, optionId];
    });
  };
  const n = product.nutrition;

  return (
    <>
      <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-[32px] font-semibold leading-[1.02] text-ink text-balance">{product.name}</h2>
          <div className="shrink-0 text-right">
            <div className="tabular text-[24px] font-extrabold leading-none tracking-tight text-ink">{formatEur(unit)}</div>
            {showBgn && <div className="tabular mt-1 text-[11.5px] text-ink-mute">≈ {formatBgn(unit, bgnRate)}</div>}
          </div>
        </div>
        {product.portion && <div className="mt-2 inline-flex rounded-full bg-sand px-3 py-1 text-[12px] font-semibold text-ink-soft">{product.portion}</div>}
        {product.description && <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{product.description}</p>}
        {product.ingredients && <p className="mt-2 text-[13px] text-ink-soft"><b className="text-ink">Състав:</b> {product.ingredients}</p>}
        {product.allergens.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.allergens.map((a) => <span key={a} className="rounded-full border border-ink/15 px-2.5 py-1 text-[11.5px] text-ink-soft">{a}</span>)}
          </div>
        )}
        {n && (
          <div className="mt-4 grid grid-cols-4 divide-x divide-ink/10 rounded-2xl border border-ink/10">
            {[['Калории', n.kcal, 'kcal'], ['Протеини', n.protein, 'г'], ['Мазнини', n.fat, 'г'], ['Въглехидрати', n.carbs, 'г']].map(([l, v, u]) => (
              <div key={String(l)} className="py-2.5 text-center">
                <div className="truncate text-[9.5px] font-semibold uppercase text-ink-mute">{l}</div>
                <div className="tabular font-display text-[20px] font-semibold">{v ?? '—'}</div>
                <div className="text-[10px] text-ink-mute">{u}</div>
              </div>
            ))}
          </div>
        )}
        {product.modifier_groups.map((g) => (
          <fieldset key={g.id} className="mt-5">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-mute">{g.name}{g.min > 0 ? ' · задължително' : g.max > 1 ? ` · до ${g.max}` : ''}</legend>
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => toggle(g.id, o.id)} className={`min-h-10 rounded-full border px-4 text-[13px] font-medium transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-ink/15 text-ink-soft'}`}>
                    {o.name}
                    {o.price_delta_cents !== 0 && <span className="tabular ml-1.5 opacity-70">{o.price_delta_cents > 0 ? '+' : ''}{formatEur(o.price_delta_cents)}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="border-t border-ink/10 bg-paper px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {product.is_available ? (
          <AddControl large name={product.name} qty={qty} onAdd={() => onAdd(product, selected)} onInc={() => onInc(key)} onDec={() => onDec(key)} />
        ) : (
          <div className="grid h-14 place-items-center rounded-full border border-ink/15 text-sm text-ink-mute">Временно изчерпано</div>
        )}
      </div>
    </>
  );
}
