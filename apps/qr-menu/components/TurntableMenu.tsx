'use client';

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicCategory, PublicProduct } from '@noar/types';
import { formatBgn, formatEur } from '@noar/api-client';
import { PlateArt } from './PlateArt';
import { MagneticButton } from './MagneticButton';
import { lineKey } from '@/lib/cart';
import { pad2 } from '@/lib/labels';
import { useReducedMotion } from '@/lib/useMedia';

/**
 * NOAR signature: circular 3D plate carousel (turntable) with crimson focus laser,
 * liquid-chrome ring, inertial drag + spring snap, tap-to-focus, Предишно/Следващо,
 * keyboard arrows and a reduced-motion fallback. Pure CSS 3D (perspective: 1200px)
 * driven by Motion springs — one animation owner for the rotation.
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

  useEffect(() => setFocus(0), [activeCategoryId]);

  const product = category?.products[Math.min(focus, (category?.products.length ?? 1) - 1)];

  return (
    <section aria-label="Меню" className="relative">
      <CategoryRail categories={categories} activeId={category?.id} onChange={onCategoryChange} />

      <div className="relative mt-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {category && category.products.length > 0 ? (
            <Turntable key={category.id} products={category.products} focus={focus} onFocusChange={setFocus} />
          ) : (
            <div className="grid h-[340px] place-items-center text-sm text-chrome-500">Няма налични ястия в тази категория.</div>
          )}
        </AnimatePresence>
      </div>

      {product && category && (
        <DishSpecCard
          key={category.id}
          product={product}
          index={focus}
          total={category.products.length}
          categoryName={category.name}
          {...props}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------- categories

function CategoryRail({ categories, activeId, onChange }: { categories: PublicCategory[]; activeId?: number; onChange: (id: number) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-cat="${activeId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeId]);

  return (
    <div ref={railRef} role="tablist" aria-label="Категории" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {categories.map((c, i) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            role="tab"
            data-cat={c.id}
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={`relative shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold tracking-wide transition-colors duration-300 ${
              active ? 'text-white' : 'text-chrome-500 hover:text-chrome-300'
            }`}
          >
            {active && (
              <motion.span
                layoutId="cat-pill"
                className="glass crimson-rim absolute inset-0 rounded-full"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            {!active && <span className="absolute inset-0 rounded-full border border-white/10" />}
            <span className="relative flex items-center gap-2">
              <span className={`font-mono text-[10px] ${active ? 'text-crimson' : 'text-chrome-700'}`}>{pad2(i + 1)}</span>
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------- turntable

const mod = (n: number, m: number) => ((n % m) + m) % m;

function useStageWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(360);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const Turntable = memo(function Turntable({
  products,
  focus,
  onFocusChange,
}: {
  products: PublicProduct[];
  focus: number;
  onFocusChange: (i: number) => void;
}) {
  const n = products.length;
  const step = 360 / n;
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const width = useStageWidth(stageRef);

  // Geometry scales with the stage (phone → desktop)
  const plate = Math.round(Math.min(220, Math.max(150, width * 0.48)));
  const radius = Math.round(Math.min(330, Math.max(118, width * 0.38)));
  const ringRy = Math.round(radius * 0.3);
  const stageH = 34 + plate * 1.12 + 18;

  // Spin-in on category change (rotation is the single animation owner)
  const rotation = useMotionValue(reduced ? 0 : step * 1.35);
  const anim = useRef<ReturnType<typeof animate> | null>(null);

  const springTo = useCallback(
    (target: number, velocity = 0) => {
      anim.current?.stop();
      if (reduced) {
        rotation.set(target);
        return;
      }
      anim.current = animate(rotation, target, { type: 'spring', stiffness: 150, damping: 21, mass: 1, velocity });
    },
    [reduced, rotation],
  );

  useEffect(() => {
    springTo(0);
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(rotation, 'change', (r) => {
    const idx = mod(Math.round(-r / step), n);
    if (idx !== focusRef.current) {
      focusRef.current = idx;
      onFocusChange(idx);
    }
  });
  const focusRef = useRef(focus);

  const goTo = useCallback(
    (index: number) => {
      const current = rotation.get();
      const currentIdx = Math.round(-current / step);
      let delta = mod(index - mod(currentIdx, n), n);
      if (delta > n / 2) delta -= n;
      springTo(-(currentIdx + delta) * step);
    },
    [n, rotation, springTo, step],
  );
  const next = useCallback(() => springTo((Math.round(rotation.get() / step) - 1) * step), [rotation, springTo, step]);
  const prev = useCallback(() => springTo((Math.round(rotation.get() / step) + 1) * step), [rotation, springTo, step]);

  // Drag with inertia → spring snap-to-focus
  const drag = useRef<{ x: number; y: number; rot: number; lastX: number; lastT: number; v: number; moved: boolean; locked: 'x' | 'y' | null; plate: number | null; id: number } | null>(null);
  const degPerPx = 70 / Math.max(120, radius * 1.25);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    anim.current?.stop();
    const plateEl = (e.target as HTMLElement).closest<HTMLElement>('[data-plate]');
    drag.current = {
      x: e.clientX, y: e.clientY, rot: rotation.get(), lastX: e.clientX, lastT: performance.now(), v: 0,
      moved: false, locked: null, plate: plateEl ? Number(plateEl.dataset.plate) : null, id: e.pointerId,
    };
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
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.8 * ((e.clientX - d.lastX) / dt) + 0.2 * d.v; // px/ms, smoothed
    d.lastX = e.clientX;
    d.lastT = now;
    rotation.set(d.rot + dx * degPerPx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (d.plate !== null) goTo(d.plate);
      return;
    }
    const velDeg = d.v * 1000 * degPerPx; // deg/s
    const projected = rotation.get() + velDeg * 0.22;
    const maxTravel = step * 2;
    const clamped = Math.max(d.rot - maxTravel * 1.5, Math.min(d.rot + maxTravel * 1.5, projected));
    springTo(Math.round(clamped / step) * step, velDeg);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  const ringRotate = useTransform(rotation, (r) => -r);

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: 'blur(8px)', transition: { duration: 0.22 } }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        ref={stageRef}
        role="listbox"
        aria-label="Въртяща се маса с ястия. Използвайте стрелките наляво и надясно."
        aria-activedescendant={`plate-${products[focus]?.id}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className="relative mx-auto w-full max-w-[860px] cursor-grab select-none outline-none focus-visible:ring-1 focus-visible:ring-crimson/60 active:cursor-grabbing"
        style={{ height: stageH, touchAction: 'pan-y', perspective: '1200px', perspectiveOrigin: '50% 30%' }}
      >
        {/* volumetric crimson haze */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2"
          style={{
            top: plate * 0.15,
            width: radius * 2.6,
            height: plate * 1.3,
            background: 'radial-gradient(ellipse at 50% 55%, rgba(255,42,42,0.22), rgba(153,0,0,0.10) 40%, transparent 70%)',
            filter: 'blur(10px)',
          }}
        />

        {/* top crimson focus laser-marker */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-[200] -translate-x-1/2" style={{ height: 34 }}>
          <div className="laser-pulse mx-auto h-full w-px bg-gradient-to-b from-transparent via-crimson to-crimson shadow-[0_0_12px_2px_rgba(255,42,42,0.75)]" />
          <div className="laser-pulse mx-auto -mt-px h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-crimson drop-shadow-[0_0_8px_rgba(255,42,42,0.9)]" />
          <span className="absolute left-3 top-0 whitespace-nowrap font-mono text-[9px] tracking-[0.3em] text-crimson/80">ФОКУС</span>
        </div>

        {/* liquid-chrome turntable ring */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2"
          style={{ top: 34 + plate / 2 + 6 - ringRy, width: radius * 2 + plate * 0.5, height: ringRy * 2 + plate * 0.18, transform: 'translateX(-50%)' }}
        >
          <div className="absolute inset-0 rounded-[50%] border border-white/10 bg-[radial-gradient(ellipse_at_50%_40%,rgba(255,255,255,0.05),rgba(5,5,7,0.6)_60%,transparent_75%)]" />
          <div className="absolute inset-[3%] overflow-hidden rounded-[50%]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 0 40px rgba(255,42,42,0.15)' }}>
            <div className="absolute inset-0" style={{ transform: 'scaleY(1)' }}>
              <motion.div
                className="absolute left-1/2 top-1/2 aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  rotate: ringRotate,
                  background:
                    'conic-gradient(from 0deg, rgba(255,255,255,0.0), rgba(255,255,255,0.35) 8%, rgba(201,204,211,0.05) 18%, rgba(255,42,42,0.35) 30%, rgba(255,255,255,0.0) 40%, rgba(255,255,255,0.28) 58%, rgba(138,143,153,0.05) 70%, rgba(255,42,42,0.25) 84%, rgba(255,255,255,0))',
                  maskImage: 'radial-gradient(closest-side, transparent 86%, black 88%, black 100%)',
                  WebkitMaskImage: 'radial-gradient(closest-side, transparent 86%, black 88%, black 100%)',
                }}
              />
            </div>
          </div>
          {/* crimson rim light on the front edge */}
          <div className="absolute inset-x-[12%] bottom-0 h-[38%] rounded-[50%] border-b-2 border-crimson/70 shadow-[0_10px_30px_rgba(255,42,42,0.35)]" />
          {/* tick marks */}
          <div className="absolute inset-[6%] rounded-[50%] border border-dashed border-white/[0.07]" />
        </div>

        {products.map((p, i) => (
          <Plate
            key={p.id}
            product={p}
            index={i}
            step={step}
            rotation={rotation}
            radius={radius}
            ringRy={ringRy}
            size={plate}
            focused={i === focus}
            top={34}
          />
        ))}
      </div>

      {/* controls */}
      <div className="mt-1 flex items-center justify-center gap-3">
        <button
          onClick={prev}
          className="group flex h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-[13px] font-semibold text-chrome-300 transition-colors hover:border-white/25 hover:text-white active:scale-[0.96]"
        >
          <span aria-hidden className="text-crimson transition-transform group-hover:-translate-x-0.5">←</span> Предишно
        </button>
        <div className="flex gap-1.5" aria-hidden>
          {products.map((p, i) => (
            <span key={p.id} className={`h-1 rounded-full transition-all duration-300 ${i === focus ? 'w-6 bg-crimson shadow-[0_0_8px_rgba(255,42,42,0.8)]' : 'w-1.5 bg-white/20'}`} />
          ))}
        </div>
        <button
          onClick={next}
          className="group flex h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-[13px] font-semibold text-chrome-300 transition-colors hover:border-white/25 hover:text-white active:scale-[0.96]"
        >
          Следващо <span aria-hidden className="text-crimson transition-transform group-hover:translate-x-0.5">→</span>
        </button>
      </div>
    </motion.div>
  );
});

const Plate = memo(function Plate({
  product,
  index,
  step,
  rotation,
  radius,
  ringRy,
  size,
  focused,
  top,
}: {
  product: PublicProduct;
  index: number;
  step: number;
  rotation: MotionValue<number>;
  radius: number;
  ringRy: number;
  size: number;
  focused: boolean;
  top: number;
}) {
  const angle = useTransform(rotation, (r) => ((index * step + r) * Math.PI) / 180);
  const x = useTransform(angle, (a) => Math.sin(a) * radius);
  const y = useTransform(angle, (a) => (Math.cos(a) - 1) * ringRy);
  const z = useTransform(angle, (a) => (Math.cos(a) - 1) * radius * 0.9);
  const depth = useTransform(angle, (a) => (Math.cos(a) + 1) / 2);
  const scale = useTransform(depth, (d) => 0.5 + 0.5 * d * d);
  const opacity = useTransform(depth, (d) => 0.28 + 0.72 * d);
  const zIndex = useTransform(depth, (d) => Math.round(d * 100));
  const shadowOpacity = useTransform(depth, (d) => 0.25 + 0.55 * d);
  // plates yaw toward the turntable centre → reads as a real rotating table, not flat cards
  const rotateY = useTransform(angle, (a) => Math.sin(a) * -28);

  return (
    <motion.div
      id={`plate-${product.id}`}
      role="option"
      aria-selected={focused}
      aria-label={`${product.name}${product.is_available ? '' : ' — временно изчерпано'}`}
      data-plate={index}
      className="absolute left-1/2 will-change-transform"
      style={{ top, width: size, height: size, marginLeft: -size / 2, x, y, z, rotateY, scale, opacity, zIndex, transformStyle: 'preserve-3d' }}
    >
      {/* contact shadow on the ring */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-[88%] h-[18%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black blur-md"
        style={{ opacity: shadowOpacity }}
      />
      <motion.div
        className="relative h-full w-full rounded-full"
        animate={{
          scale: focused ? 1.1 : 1,
          boxShadow: focused
            ? '0 0 30px rgba(255,42,42,0.5), 0 0 0 1px rgba(255,42,42,0.55), 0 30px 60px -20px rgba(0,0,0,0.9)'
            : '0 0 0px rgba(255,42,42,0), 0 0 0 1px rgba(255,255,255,0.06), 0 24px 40px -24px rgba(0,0,0,0.9)',
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <PlateArt art={product.art} imageUrl={product.image_url} label={product.name} seed={product.id} />
        {!product.is_available && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60 font-mono text-[10px] uppercase tracking-[0.25em] text-chrome-300">
            Изчерпано
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------- spec card

function DishSpecCard({
  product,
  index,
  total,
  categoryName,
  showBgn,
  bgnRate,
  quantityFor,
  onAdd,
  onInc,
  onDec,
}: Props & { product: PublicProduct; index: number; total: number; categoryName: string }) {
  const reduced = useReducedMotion();
  const defaults = useMemo(
    () => product.modifier_groups.filter((g) => g.kind === 'variant' && g.min > 0 && g.options[0]).map((g) => g.options[0].id),
    [product],
  );
  const [selected, setSelected] = useState<number[]>(defaults);
  useEffect(() => setSelected(defaults), [defaults]);

  const unit = product.price_cents + product.modifier_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.price_delta_cents, 0);
  const key = lineKey(product.id, selected);
  const qty = quantityFor(key);

  const toggle = (groupId: number, optionId: number) => {
    const group = product.modifier_groups.find((g) => g.id === groupId)!;
    const groupIds = group.options.map((o) => o.id);
    setSelected((cur) => {
      if (group.max === 1) return [...cur.filter((id) => !groupIds.includes(id)), optionId];
      if (cur.includes(optionId)) {
        const remaining = cur.filter((id) => id !== optionId);
        return remaining.filter((id) => groupIds.includes(id)).length < group.min ? cur : remaining;
      }
      if (cur.filter((id) => groupIds.includes(id)).length >= group.max) return cur;
      return [...cur, optionId];
    });
  };

  const variants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -8, filter: 'blur(4px)' },
      };

  return (
    <div className="glass relative mx-auto mt-4 max-w-[860px] overflow-hidden rounded-[28px] p-5 sm:p-7">
      <div aria-hidden className="chrome-line absolute inset-x-6 top-0 h-px opacity-60" />
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-crimson/10 blur-3xl" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={product.id} {...variants} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} aria-live="polite">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-chrome-500">
            <span>
              <span className="text-crimson">{pad2(index + 1)}</span> / {pad2(total)} · {categoryName}
            </span>
            {product.portion && <span className="tracking-[0.18em]">{product.portion}</span>}
          </div>

          <div className="mt-3 flex items-start justify-between gap-4">
            <h2 className="chrome-text font-display text-[26px] leading-[1.08] font-semibold tracking-tight text-balance sm:text-[34px]">{product.name}</h2>
            <div className="shrink-0 text-right">
              <div className="tabular font-display text-[22px] font-semibold text-white sm:text-[26px]">{formatEur(unit)}</div>
              {showBgn && <div className="tabular font-mono text-[11px] text-chrome-500">≈ {formatBgn(unit, bgnRate)}</div>}
            </div>
          </div>

          <p className="mt-3 text-[14px] leading-relaxed text-chrome-300 text-pretty">{product.description}</p>

          {product.ingredients && (
            <p className="mt-2 text-[12px] leading-relaxed text-chrome-500">
              <span className="font-mono uppercase tracking-[0.2em] text-chrome-700">Състав · </span>
              {product.ingredients}
            </p>
          )}

          {product.allergens.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Алергени">
              {product.allergens.map((a) => (
                <span key={a} className="rounded-full border border-crimson/30 bg-crimson/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#ffb3b3]">
                  {a}
                </span>
              ))}
            </div>
          )}

          <NutritionTelemetry product={product} />

          {product.modifier_groups.map((g) => (
            <fieldset key={g.id} className="mt-4">
              <legend className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-chrome-500">
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
                      className={`min-h-10 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors duration-200 active:scale-[0.97] ${
                        on ? 'border-crimson/70 bg-crimson/15 text-white shadow-[0_0_16px_rgba(255,42,42,0.25)]' : 'border-white/10 text-chrome-300 hover:border-white/25'
                      }`}
                    >
                      {o.name}
                      {o.price_delta_cents !== 0 && (
                        <span className="tabular ml-1.5 text-chrome-500">
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
        </motion.div>
      </AnimatePresence>

      <div className="mt-5">
        <AnimatePresence mode="wait" initial={false}>
          {!product.is_available ? (
            <motion.div key="na" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-14 place-items-center rounded-2xl border border-white/10 text-sm text-chrome-500">
              Временно изчерпано
            </motion.div>
          ) : qty === 0 ? (
            <motion.div key="add" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18 }}>
              <MagneticButton
                onClick={() => {
                  onAdd(product, selected);
                  try {
                    navigator.vibrate?.(8);
                  } catch {
                    /* ignore */
                  }
                }}
                className="group relative h-14 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-crimson to-crimson-deep text-[15px] font-bold tracking-wide text-white shadow-[0_10px_40px_-10px_rgba(255,42,42,0.8),inset_0_1px_0_rgba(255,255,255,0.35)]"
              >
                <span aria-hidden className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.28)_50%,transparent_70%)] bg-[length:250%_100%] bg-[position:120%_0] transition-[background-position] duration-700 group-hover:bg-[position:-20%_0]" />
                <span className="relative">+ Добави към поръчката</span>
              </MagneticButton>
            </motion.div>
          ) : (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="crimson-rim flex h-14 items-center justify-between rounded-2xl bg-black/40 px-2"
            >
              <button aria-label="Намали количеството" onClick={() => onDec(key)} className="grid h-11 w-14 place-items-center rounded-xl text-2xl font-light text-white transition active:scale-90 hover:bg-white/5">
                −
              </button>
              <div className="text-center" aria-live="polite">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div key={qty} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="tabular font-display text-xl font-semibold">
                    {qty}
                  </motion.div>
                </AnimatePresence>
                <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-crimson">в поръчката</div>
              </div>
              <button aria-label="Увеличи количеството" onClick={() => onInc(key)} className="grid h-11 w-14 place-items-center rounded-xl text-2xl font-light text-white transition active:scale-90 hover:bg-white/5">
                +
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NutritionTelemetry({ product }: { product: PublicProduct }) {
  const n = product.nutrition;
  if (!n) return null;
  const cols: Array<{ label: string; value: number | null; unit: string; max: number }> = [
    { label: 'Калории', value: n.kcal, unit: 'kcal', max: 1200 },
    { label: 'Протеини', value: n.protein, unit: 'г', max: 80 },
    { label: 'Мазнини', value: n.fat, unit: 'г', max: 80 },
    { label: 'Въглехидрати', value: n.carbs, unit: 'г', max: 120 },
  ];
  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {cols.map((c, i) => (
          <div key={c.label} className={`px-2 py-3 text-center ${i > 0 ? 'border-l border-white/10' : ''}`}>
            <div className="truncate font-mono text-[8.5px] uppercase tracking-[0.12em] text-chrome-500 sm:text-[10px]">{c.label}</div>
            <div className="tabular mt-1 font-display text-[17px] font-semibold text-white sm:text-[20px]">{c.value ?? '—'}</div>
            <div className="font-mono text-[9px] text-chrome-500">{c.unit}</div>
            <div className="mx-auto mt-2 h-[2px] w-10/12 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-crimson-deep to-crimson" style={{ width: `${Math.min(100, ((c.value ?? 0) / c.max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {n.is_estimate && <p className="mt-1.5 font-mono text-[9.5px] text-chrome-700">* ориентировъчни стойности на порция, непотвърдени лабораторно</p>}
    </div>
  );
}
