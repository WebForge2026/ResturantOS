'use client';

import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicCategory, PublicProduct } from '@noar/types';
import { formatBgn, formatEur } from '@noar/api-client';
import type { CartLine } from '@/lib/cart';
import { useReducedMotion } from '@/lib/useMedia';
import { DishSheet } from './DishSheet';
import { PlateArt } from './PlateArt';

/**
 * Standard QR menu: sticky category bar (scroll-spy), search, dish cards with photos and a
 * morphing add-button → stepper. Native scrolling, lazy images, no heavy animation → fast on phones.
 */
type Props = {
  categories: PublicCategory[];
  showBgn: boolean;
  bgnRate: number;
  lines: CartLine[];
  onAdd: (product: PublicProduct, modifierIds: number[]) => void;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
};

export const defaultModifiers = (p: PublicProduct) => p.modifier_groups.filter((g) => g.kind === 'variant' && g.min > 0 && g.options[0]).map((g) => g.options[0].id);
const needsChoice = (p: PublicProduct) => p.modifier_groups.some((g) => g.min > 0 && g.options.length > 1) || p.modifier_groups.some((g) => g.kind === 'modifier');

export function MenuList({ categories, showBgn, bgnRate, lines, onAdd, onInc, onDec }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<number | null>(categories[0]?.id ?? null);
  const [sheet, setSheet] = useState<PublicProduct | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const clickScroll = useRef(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, products: c.products.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)) }))
      .filter((c) => c.products.length > 0);
  }, [categories, query]);

  // scroll-spy
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (clickScroll.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.section));
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    document.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [filtered]);

  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  const jump = (id: number) => {
    setActive(id);
    clickScroll.current = true;
    const el = document.getElementById(`cat-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 112, behavior: 'smooth' });
    setTimeout(() => (clickScroll.current = false), 700);
  };

  const qtyOf = useCallback((productId: number) => lines.filter((l) => l.product.id === productId).reduce((s, l) => s + l.quantity, 0), [lines]);
  const lastKeyOf = useCallback((productId: number) => [...lines].reverse().find((l) => l.product.id === productId)?.key ?? null, [lines]);

  const quickAdd = (p: PublicProduct) => {
    if (needsChoice(p)) return setSheet(p);
    onAdd(p, defaultModifiers(p));
    try {
      navigator.vibrate?.(8);
    } catch {
      /* ignore */
    }
  };

  return (
    <section aria-label="Меню">
      {/* sticky categories + search */}
      <div className="sticky top-[var(--pill-h,0px)] z-40 -mx-5 border-b border-ink/10 bg-linen/90 px-5 pb-2 pt-3 backdrop-blur-xl">
        <div className="relative">
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Търсене в менюто"
            aria-label="Търсене в менюто"
            className="h-11 w-full rounded-full border border-ink/10 bg-paper pl-10 pr-4 text-[14px] text-ink placeholder:text-ink-mute focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25"
          />
        </div>
        <div ref={railRef} role="tablist" aria-label="Категории" className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 py-1">
          {filtered.map((c) => {
            const on = c.id === active;
            return (
              <button
                key={c.id}
                role="tab"
                data-cat={c.id}
                aria-selected={on}
                onClick={() => jump(c.id)}
                className={`relative h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${on ? 'text-paper' : 'border border-ink/10 bg-paper text-ink-soft hover:text-ink'}`}
              >
                {on && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && <p className="py-16 text-center text-[14px] text-ink-mute">Няма намерени ястия за „{query}“.</p>}

      {filtered.map((c) => (
        <div key={c.id} id={`cat-${c.id}`} data-section={c.id} className="scroll-mt-28 pt-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[30px] font-semibold leading-none text-ink">{c.name}</h2>
            <span className="text-[12px] text-ink-mute">{c.products.length} ястия</span>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {c.products.map((p) => (
              <DishCard key={p.id} product={p} qty={qtyOf(p.id)} showBgn={showBgn} bgnRate={bgnRate} onOpen={() => setSheet(p)} onAdd={() => quickAdd(p)} onInc={() => { const k = lastKeyOf(p.id); if (k) onInc(k); }} onDec={() => { const k = lastKeyOf(p.id); if (k) onDec(k); }} />
            ))}
          </ul>
        </div>
      ))}

      <DishSheet product={sheet} onClose={() => setSheet(null)} showBgn={showBgn} bgnRate={bgnRate} lines={lines} onAdd={onAdd} onInc={onInc} onDec={onDec} />
    </section>
  );
}

const DishCard = memo(function DishCard({
  product: p,
  qty,
  showBgn,
  bgnRate,
  onOpen,
  onAdd,
  onInc,
  onDec,
}: {
  product: PublicProduct;
  qty: number;
  showBgn: boolean;
  bgnRate: number;
  onOpen: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <li className={`group relative flex gap-3.5 rounded-[26px] border border-ink/[0.07] bg-paper p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-22px_rgba(60,40,20,0.45)] transition-shadow ${p.is_available ? '' : 'opacity-60'}`}>
      <button onClick={onOpen} className="absolute inset-0 rounded-[26px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/50" aria-label={`${p.name} — подробности`} />
      <div className="pointer-events-none relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[20px] bg-sand">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt="" loading="lazy" decoding="async" width={208} height={208} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="p-2"><PlateArt art={p.art} imageUrl={null} label={p.name} seed={p.id} /></div>
        )}
        {qty > 0 && <span className="tabular absolute left-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-paper">{qty}</span>}
      </div>
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col py-1 pr-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{p.name}</h3>
        {p.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">{p.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="leading-tight">
            <div className="tabular text-[17px] font-extrabold tracking-tight text-ink">{formatEur(p.price_cents)}</div>
            {showBgn && <div className="tabular text-[10.5px] text-ink-mute">{formatBgn(p.price_cents, bgnRate)}</div>}
          </div>
          <div className="pointer-events-auto relative z-10">
            {p.is_available ? <AddControl name={p.name} qty={qty} onAdd={onAdd} onInc={onInc} onDec={onDec} /> : <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Изчерпано</span>}
          </div>
        </div>
      </div>
    </li>
  );
});

/** Round "+" that morphs into a pill stepper. */
export function AddControl({ name, qty, onAdd, onInc, onDec, large }: { name: string; qty: number; onAdd: () => void; onInc: () => void; onDec: () => void; large?: boolean }) {
  const reduced = useReducedMotion();
  const h = large ? 'h-14' : 'h-11';
  return (
    <motion.div layout={!reduced} transition={{ type: 'spring', stiffness: 520, damping: 34 }} className={`relative flex ${h} ${large ? 'w-full' : ''} items-center overflow-hidden rounded-full ${qty > 0 ? 'bg-ink text-paper' : ''}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {qty === 0 ? (
          <motion.button
            key="add"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileTap={{ scale: 0.88 }}
            onClick={onAdd}
            aria-label={`Добави ${name}`}
            className={`group/btn relative grid ${large ? 'h-14 w-full px-6' : 'h-11 w-11'} place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#c8653b] via-terra to-terra-deep text-paper shadow-[0_8px_20px_-8px_rgba(180,85,47,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]`}
          >
            <span aria-hidden className="absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.35)_50%,transparent_75%)] transition-transform duration-700 group-hover/btn:translate-x-full" />
            {large ? (
              <span className="relative text-[15px] font-bold tracking-wide">+ Добави към поръчката</span>
            ) : (
              <svg viewBox="0 0 24 24" className="relative h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </motion.button>
        ) : (
          <motion.div key="step" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`flex items-center ${large ? 'w-full justify-between px-2' : 'px-1'}`}>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onDec} aria-label={large ? 'Намали количеството' : `Намали ${name}`} className={`grid ${large ? 'h-11 w-14' : 'h-9 w-9'} place-items-center rounded-full text-[20px] hover:bg-paper/10`}>
              −
            </motion.button>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={qty} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className={`tabular ${large ? 'text-[18px]' : 'w-6 text-[15px]'} text-center font-bold`}>
                {qty}
              </motion.span>
            </AnimatePresence>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onInc} aria-label={large ? 'Увеличи количеството' : `Увеличи ${name}`} className={`grid ${large ? 'h-11 w-14' : 'h-9 w-9'} place-items-center rounded-full text-[20px] hover:bg-paper/10`}>
              +
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
