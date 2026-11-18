'use client';

import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent } from 'motion/react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicCategory, PublicProduct } from '@noar/types';
import { formatBgn, formatEur } from '@noar/api-client';
import { PlateArt } from './PlateArt';
import { MagneticButton } from './MagneticButton';
import { lineKey } from '@/lib/cart';
import { pad2 } from '@/lib/labels';
import { useReducedMotion } from '@/lib/useMedia';

/**
 * NOAR signature: a real round walnut table seen from above, plated dishes on its rim.
 * Drag / swipe turns the table (inertia + spring snap), tap a plate to bring it to the front,
 * tap the front plate for a close-up, Предишно / Следващо and arrow keys for accessible control,
 * reduced-motion fallback.
 * Performance: the whole table is ONE element rotated by a single transform (GPU-composited);
 * plates never re-layout during rotation.
 */

type Props = {
  categories: PublicCategory[];
  activeCategoryId: number;
  onCategoryChange: (id: number) => void;
  showBgn: boolean;
  bgnRate: number;
  quantityFor: (key: string) => number;
  onAdd: (product: PublicProduct, modifierIds: number[]) => void;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
};

export function TurntableMenu(props: Props) {
  const { categories, activeCategoryId, onCategoryChange } = props;
  const category = categories.find((c) => c.id === activeCategoryId) ?? categories[0];
  const [focus, setFocus] = useState(0);
  const [closeUp, setCloseUp] = useState<PublicProduct | null>(null);
  useEffect(() => setFocus(0), [activeCategoryId]);
  const products = category?.products ?? [];
  const product = products[Math.min(focus, Math.max(0, products.length - 1))];

  return (
    <section aria-label="Меню" className="relative">
      <CategoryRail categories={categories} activeId={category?.id} onChange={onCategoryChange} />

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12">
        <div className="lg:col-start-1 lg:row-start-1">
          {product && category && <DishHeading product={product} index={focus} total={products.length} categoryName={category.name} showBgn={props.showBgn} bgnRate={props.bgnRate} />}
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {products.length > 0 ? (
            <Table key={category!.id} products={products} focus={focus} onFocusChange={setFocus} onCloseUp={setCloseUp} />
          ) : (
            <div className="grid h-64 place-items-center text-sm text-ink-mute">Няма налични ястия в тази категория.</div>
          )}
        </div>
        <div className="lg:col-start-1 lg:row-start-2">{product && <DishDetails key={category!.id} product={product} {...props} />}</div>
      </div>

      <CloseUp product={closeUp} onClose={() => setCloseUp(null)} />
    </section>
  );
}

// ---------------------------------------------------------------------------- categories

function CategoryRail({ categories, activeId, onChange }: { categories: PublicCategory[]; activeId?: number; onChange: (id: number) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>(`[data-cat="${activeId}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeId]);
  return (
    <div ref={railRef} role="tablist" aria-label="Категории" className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto border-b border-ink/10 px-5">
      {categories.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            role="tab"
            data-cat={c.id}
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={`relative shrink-0 px-3 pb-3 pt-2 text-[13.5px] font-semibold transition-colors duration-200 ${active ? 'text-ink' : 'text-ink-mute hover:text-ink-soft'}`}
          >
            {c.name}
            {active && <motion.span layoutId="cat-line" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-terra" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------- heading (above the table)

function DishHeading({ product, index, total, categoryName, showBgn, bgnRate }: { product: PublicProduct; index: number; total: number; categoryName: string; showBgn: boolean; bgnRate: number }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={product.id}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
          <span>Ястие {pad2(index + 1)} от {pad2(total)}</span>
          <span className="h-px w-8 bg-ink/20" />
          <span className="truncate">{categoryName}</span>
        </div>
        <h2 className="mt-2 font-display text-[40px] font-medium leading-[0.98] tracking-[-0.01em] text-ink text-balance sm:text-[52px]">{product.name}</h2>
        <p className="mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft text-pretty">{product.description}</p>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="tabular font-display text-[30px] font-semibold text-ink">{formatEur(product.price_cents)}</span>
          {showBgn && <span className="tabular text-[12px] text-ink-mute">≈ {formatBgn(product.price_cents, bgnRate)}</span>}
          {product.portion && <span className="text-[12px] text-ink-mute">· {product.portion}</span>}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------- the table

const TABLE_TEXTURE = process.env.NEXT_PUBLIC_TABLE_TEXTURE ?? '';

const mod = (n: number, m: number) => ((n % m) + m) % m;

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const Table = memo(function Table({
  products,
  focus,
  onFocusChange,
  onCloseUp,
}: {
  products: PublicProduct[];
  focus: number;
  onFocusChange: (i: number) => void;
  onCloseUp: (p: PublicProduct) => void;
}) {
  const n = products.length;
  // Fill the whole rim: repeat the category's dishes so neighbours are always visible.
  const copies = Math.max(1, Math.ceil(8 / n));
  const slots = n * copies;
  const step = 360 / slots;
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);

  const plate = Math.round(Math.min(200, Math.max(116, width * 0.34)));
  const diameter = Math.round(width < 640 ? Math.max(620, width * 1.9) : Math.min(1000, width * 1.25));
  const radius = diameter / 2 - plate * 0.62;
  const top = 26;
  const visibleH = Math.round(top + diameter / 2 - radius + plate * 0.55 + radius * (1 - Math.cos((2.2 * step * Math.PI) / 180)) + plate * 0.25);

  const rotation = useMotionValue(reduced ? 0 : step * 2.2);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const intro = useRef(!reduced);
  const slotRef = useRef(0);
  const [slot, setSlot] = useState(0);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const springTo = useCallback(
    (target: number, velocity = 0, isIntro = false) => {
      anim.current?.stop();
      if (!isIntro) intro.current = false;
      if (reduced) {
        rotation.set(target);
        return;
      }
      anim.current = animate(rotation, target, {
        type: 'spring',
        stiffness: 170,
        damping: 24,
        mass: 0.9,
        velocity,
        onComplete: () => {
          if (isIntro) intro.current = false;
        },
      });
    },
    [reduced, rotation],
  );

  useEffect(() => {
    onFocusChange(0);
    springTo(0, 0, true);
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(rotation, 'change', (r) => {
    if (intro.current) return;
    const s = mod(Math.round(-r / step), slots);
    if (s !== slotRef.current) {
      slotRef.current = s;
      setSlot(s);
      const p = s % n;
      if (p !== focusRef.current) onFocusChange(p);
    }
  });

  const goToSlot = useCallback(
    (target: number) => {
      const cur = Math.round(-rotation.get() / step);
      let delta = mod(target - mod(cur, slots), slots);
      if (delta > slots / 2) delta -= slots;
      springTo(-(cur + delta) * step);
    },
    [rotation, slots, springTo, step],
  );
  const next = useCallback(() => springTo((Math.round(rotation.get() / step) - 1) * step), [rotation, springTo, step]);
  const prev = useCallback(() => springTo((Math.round(rotation.get() / step) + 1) * step), [rotation, springTo, step]);

  // drag along the rim → rotation (1px of finger ≈ 1px of rim travel)
  const degPerPx = 180 / (Math.PI * radius);
  const drag = useRef<{ x: number; y: number; rot: number; lastX: number; lastT: number; v: number; locked: 'x' | 'y' | null; moved: boolean; slot: number | null; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    anim.current?.stop();
    intro.current = false;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
    drag.current = { x: e.clientX, y: e.clientY, rot: rotation.get(), lastX: e.clientX, lastT: performance.now(), v: 0, locked: null, moved: false, slot: el ? Number(el.dataset.slot) : null, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.locked === 'x') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.locked !== 'x') return;
    d.moved = true;
    const now = performance.now();
    d.v = 0.75 * ((e.clientX - d.lastX) / Math.max(1, now - d.lastT)) + 0.25 * d.v;
    d.lastX = e.clientX;
    d.lastT = now;
    rotation.set(d.rot + dx * degPerPx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (d.slot === null) return;
      if (d.slot === slotRef.current) {
        const p = products[d.slot % n];
        if (p) onCloseUp(p);
      } else goToSlot(d.slot);
      return;
    }
    const velDeg = d.v * 1000 * degPerPx;
    const projected = rotation.get() + velDeg * 0.2;
    const max = step * 3;
    const clamped = Math.max(d.rot - max, Math.min(d.rot + max, projected));
    springTo(Math.round(clamped / step) * step, velDeg);
  };

  const slotItems = useMemo(() => Array.from({ length: slots }, (_, s) => products[s % n]), [products, slots, n]);

  return (
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="mt-4 lg:mt-0">
      <div
        ref={wrapRef}
        role="listbox"
        aria-label="Въртяща се маса с ястия. Плъзнете или използвайте стрелките наляво и надясно."
        aria-activedescendant={`slot-${slot}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            next();
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prev();
          }
          if (e.key === 'Enter') {
            const p = products[slot % n];
            if (p) onCloseUp(p);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className="relative -mx-5 cursor-grab select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-brass/50 active:cursor-grabbing sm:mx-0 sm:rounded-[28px]"
        style={{ height: Math.min(visibleH, 600), touchAction: 'pan-y' }}
      >
        {/* front marker */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1.5 z-20 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-brass" />
        </div>

        {/* the table: ONE rotating layer */}
        <motion.div className="walnut absolute left-1/2 rounded-full will-change-transform" style={{ width: diameter, height: diameter, top, marginLeft: -diameter / 2, rotate: rotation }}>
          {TABLE_TEXTURE ? (
            // Real wood photo (optional): apps/qr-menu/public/table/wood.jpg + NEXT_PUBLIC_TABLE_TEXTURE=/table/wood.jpg
            <div aria-hidden className="absolute inset-[10px] rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${TABLE_TEXTURE})` }} />
          ) : (
            <WoodGrain />
          )}
          {slotItems.map((p, s) => (
            <div
              key={s}
              id={`slot-${s}`}
              role="option"
              aria-selected={s === slot}
              aria-label={p.name}
              data-slot={s}
              className="absolute left-1/2 top-1/2"
              style={{ width: plate, height: plate, marginLeft: -plate / 2, marginTop: -plate / 2, transform: `rotate(${s * step}deg) translateY(${-radius}px)` }}
            >
              <div
                className="relative h-full w-full rounded-full transition-transform duration-300 ease-out"
                style={{ transform: `scale(${s === slot ? 1.1 : 0.94})`, filter: 'drop-shadow(0 14px 12px rgba(30,15,5,0.45)) drop-shadow(0 2px 2px rgba(30,15,5,0.3))' }}
              >
                <PlateArt art={p.art} imageUrl={p.image_url} label={p.name} seed={p.id} />
                {!p.is_available && <div className="absolute inset-0 grid place-items-center rounded-full bg-paper/70 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-soft">Изчерпано</div>}
              </div>
            </div>
          ))}
        </motion.div>

        {/* soft room light + fade into the page */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_10%,rgba(255,240,215,0.25),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-linen" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <button onClick={prev} className="flex h-11 items-center gap-2 rounded-full border border-ink/15 bg-paper px-4 text-[13px] font-semibold text-ink transition hover:border-ink/30 active:scale-[0.96]">
          <span aria-hidden>←</span> Предишно
        </button>
        <span className="text-center text-[11.5px] leading-tight text-ink-mute">
          Плъзнете, за да
          <br />
          завъртите масата
        </span>
        <button onClick={next} className="flex h-11 items-center gap-2 rounded-full border border-ink/15 bg-paper px-4 text-[13px] font-semibold text-ink transition hover:border-ink/30 active:scale-[0.96]">
          Следващо <span aria-hidden>→</span>
        </button>
      </div>
    </motion.div>
  );
});

/** Static procedural wood grain, rasterised once and rotated as part of the table layer. */
const WoodGrain = memo(function WoodGrain() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full rounded-full opacity-60 mix-blend-multiply" viewBox="0 0 400 400" preserveAspectRatio="none">
      <filter id="noar-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.09" numOctaves="3" seed="7" />
        <feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.27  0 0 0 0 0.16  0 0 0 0.9 -0.15" />
      </filter>
      <clipPath id="noar-round">
        <circle cx="200" cy="200" r="200" />
      </clipPath>
      <g clipPath="url(#noar-round)">
        <rect x="-60" y="-60" width="520" height="520" filter="url(#noar-grain)" transform="rotate(18 200 200)" />
      </g>
    </svg>
  );
});

// ---------------------------------------------------------------------------- close-up

function CloseUp({ product, onClose }: { product: PublicProduct | null; onClose: () => void }) {
  useEffect(() => {
    if (!product) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [product, onClose]);
  return (
    <AnimatePresence>
      {product && (
        <motion.div
          className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-linen/95 px-6 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-label={product.name}
        >
          <motion.div
            className="w-[min(82vw,460px)]"
            initial={{ scale: 0.6, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            style={{ filter: 'drop-shadow(0 30px 30px rgba(40,20,5,0.35))' }}
          >
            <PlateArt art={product.art} imageUrl={product.image_url} label={product.name} seed={product.id} />
          </motion.div>
          <div className="mt-6 text-center font-display text-[30px] leading-tight">{product.name}</div>
          <button onClick={onClose} className="mt-4 rounded-full border border-ink/20 bg-paper px-5 py-2.5 text-[13px] font-semibold">
            ← Обратно към масата
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------- details below the table

function DishDetails({ product, quantityFor, onAdd, onInc, onDec }: Props & { product: PublicProduct }) {
  const defaults = useMemo(() => product.modifier_groups.filter((g) => g.kind === 'variant' && g.min > 0 && g.options[0]).map((g) => g.options[0].id), [product]);
  // Selections are stored per product so they can never lag behind the focused dish.
  const [selections, setSelections] = useState<Record<number, number[]>>({});
  const selected = selections[product.id] ?? defaults;
  const setSelected = (fn: (cur: number[]) => number[]) => setSelections((all) => ({ ...all, [product.id]: fn(all[product.id] ?? defaults) }));
  const unit = product.price_cents + product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.price_delta_cents, 0);
  const key = lineKey(product.id, selected);
  const qty = quantityFor(key);

  const toggle = (groupId: number, optionId: number) => {
    const group = product.modifier_groups.find((g) => g.id === groupId)!;
    const ids = group.options.map((o) => o.id);
    setSelected((cur) => {
      if (group.max === 1) return [...cur.filter((id) => !ids.includes(id)), optionId];
      if (cur.includes(optionId)) {
        const rest = cur.filter((id) => id !== optionId);
        return rest.filter((id) => ids.includes(id)).length < group.min ? cur : rest;
      }
      if (cur.filter((id) => ids.includes(id)).length >= group.max) return cur;
      return [...cur, optionId];
    });
  };

  return (
    <div className="mt-6 lg:mt-8">
      {product.ingredients && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">Състав: </span>
          {product.ingredients}
        </p>
      )}
      {product.allergens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Алергени">
          {product.allergens.map((a) => (
            <span key={a} className="rounded-full border border-ink/15 bg-paper px-2.5 py-1 text-[11.5px] font-medium text-ink-soft">
              {a}
            </span>
          ))}
        </div>
      )}
      <Nutrition product={product} />
      {product.modifier_groups.map((g) => (
        <fieldset key={g.id} className="mt-5">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
            {g.name}
            {g.min > 0 ? ' · задължително' : g.max > 1 ? ` · до ${g.max}` : ''}
          </legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(g.id, o.id)}
                  className={`min-h-10 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors active:scale-[0.97] ${on ? 'border-ink bg-ink text-paper' : 'border-ink/15 bg-paper text-ink-soft hover:border-ink/35'}`}
                >
                  {o.name}
                  {o.price_delta_cents !== 0 && (
                    <span className={`tabular ml-1.5 ${on ? 'text-paper/70' : 'text-ink-mute'}`}>
                      {o.price_delta_cents > 0 ? '+' : ''}
                      {formatEur(o.price_delta_cents)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="mt-6">
        <AnimatePresence mode="wait" initial={false}>
          {!product.is_available ? (
            <motion.div key="na" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-14 place-items-center rounded-full border border-ink/15 text-sm text-ink-mute">
              Временно изчерпано
            </motion.div>
          ) : qty === 0 ? (
            <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <MagneticButton
                onClick={() => {
                  onAdd(product, selected);
                  try {
                    navigator.vibrate?.(8);
                  } catch {
                    /* ignore */
                  }
                }}
                className="h-14 w-full rounded-full bg-terra text-[15px] font-bold tracking-wide text-paper shadow-[0_12px_30px_-12px_rgba(180,85,47,0.8)] transition-colors hover:bg-terra-deep"
              >
                + Добави към поръчката
              </MagneticButton>
            </motion.div>
          ) : (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="flex h-14 items-center justify-between rounded-full border border-ink/15 bg-paper px-2"
            >
              <button aria-label="Намали количеството" onClick={() => onDec(key)} className="grid h-11 w-14 place-items-center rounded-full text-2xl text-ink transition hover:bg-sand active:scale-90">
                −
              </button>
              <div className="text-center" aria-live="polite">
                <div className="tabular font-display text-[24px] font-semibold leading-none">{qty}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terra">в поръчката</div>
              </div>
              <button aria-label="Увеличи количеството" onClick={() => onInc(key)} className="grid h-11 w-14 place-items-center rounded-full text-2xl text-ink transition hover:bg-sand active:scale-90">
                +
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {unit !== product.price_cents && <p className="tabular mt-2 text-center text-[12px] text-ink-mute">С избраните добавки: {formatEur(unit)}</p>}
      </div>
    </div>
  );
}

function Nutrition({ product }: { product: PublicProduct }) {
  const n = product.nutrition;
  if (!n) return null;
  const cols = [
    { label: 'Калории', value: n.kcal, unit: 'kcal' },
    { label: 'Протеини', value: n.protein, unit: 'г' },
    { label: 'Мазнини', value: n.fat, unit: 'г' },
    { label: 'Въглехидрати', value: n.carbs, unit: 'г' },
  ];
  return (
    <div className="mt-5">
      <div className="grid grid-cols-4 divide-x divide-ink/10 rounded-2xl border border-ink/10 bg-paper">
        {cols.map((c) => (
          <div key={c.label} className="px-1.5 py-3 text-center">
            <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-mute">{c.label}</div>
            <div className="tabular mt-1 font-display text-[22px] font-semibold leading-none text-ink">{c.value ?? '—'}</div>
            <div className="mt-0.5 text-[10px] text-ink-mute">{c.unit}</div>
          </div>
        ))}
      </div>
      {n.is_estimate && <p className="mt-1.5 text-[10.5px] text-ink-mute">* ориентировъчни стойности на порция</p>}
    </div>
  );
}
