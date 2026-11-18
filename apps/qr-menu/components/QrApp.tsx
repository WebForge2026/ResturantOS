'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, formatEur, newIdempotencyKey } from '@noar/api-client';
import type { DemoTable, PublicTableContext } from '@noar/types';
import { api } from '@/lib/api';
import { cartCount, cartReducer, cartTotal } from '@/lib/cart';
import { pad2 } from '@/lib/labels';
import { store } from '@/lib/storage';
import { useLiveSession } from '@/lib/useLiveSession';
import { useReducedMotion } from '@/lib/useMedia';
import { MenuList } from './MenuList';
import { OrderDrawer } from './OrderDrawer';
import { OrderStatusTracker } from './OrderStatusTracker';
import { MagneticButton } from './MagneticButton';

const DEFAULT_TABLE = 4;

export function QrApp() {
  const params = useSearchParams();
  const router = useRouter();
  const reduced = useReducedMotion();
  const directToken = params.get('t');
  const tableParam = Number(params.get('table') ?? DEFAULT_TABLE) || DEFAULT_TABLE;

  const [demoTables, setDemoTables] = useState<DemoTable[] | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(directToken);
  const [ctx, setCtx] = useState<PublicTableContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<number | null>(null);

  const [lines, dispatch] = useReducer(cartReducer, []);
  const [note, setNote] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [tracker, setTracker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- resolve table → QR token
  useEffect(() => {
    if (directToken) {
      setQrToken(directToken);
      return;
    }
    let alive = true;
    api
      .demoTables()
      .then(({ data }) => {
        if (!alive) return;
        setDemoTables(data);
        const t = data.find((d) => d.number === tableParam) ?? data.find((d) => d.number === DEFAULT_TABLE) ?? data[0];
        if (t) setQrToken(t.qr_token);
        else setLoadError('Няма конфигурирани маси.');
      })
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Сървърът не е достъпен.'));
    return () => {
      alive = false;
    };
  }, [directToken, tableParam]);

  useEffect(() => {
    if (!qrToken) return;
    let alive = true;
    setCtx(null);
    setLoadError(null);
    api
      .table(qrToken)
      .then((c) => {
        if (!alive) return;
        setCtx(c);
        setActiveCat((cur) => cur ?? c.menu.categories[0]?.id ?? null);
      })
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Сървърът не е достъпен.'));
    setGuestToken(store.get(`noar.guest.${qrToken}`));
    try {
      const saved = JSON.parse(store.get(`noar.cart.${qrToken}`) ?? '[]');
      dispatch({ type: 'hydrate', lines: Array.isArray(saved) ? saved : [] });
    } catch {
      dispatch({ type: 'clear' });
    }
    return () => {
      alive = false;
    };
  }, [qrToken]);

  // keep the cart through reloads (per table, this device only)
  useEffect(() => {
    if (qrToken) store.set(`noar.cart.${qrToken}`, JSON.stringify(lines));
  }, [lines, qrToken]);

  // refresh cart product snapshots when the live menu changes (availability/prices)
  const productIndex = useMemo(() => new Map(ctx?.menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const)) ?? []), [ctx]);

  const onClosed = useCallback(() => {
    if (qrToken) store.remove(`noar.guest.${qrToken}`);
    setGuestToken(null);
  }, [qrToken]);
  const live = useLiveSession(guestToken, onClosed);

  // ---------------------------------------------------------------- smooth scrolling (Lenis) — pointer devices only
  useEffect(() => {
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let raf = 0;
    import('lenis').then(({ default: Lenis }) => {
      lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [reduced]);

  useEffect(() => {
    document.documentElement.style.overflow = drawer || tracker ? 'hidden' : '';
  }, [drawer, tracker]);

  // ---------------------------------------------------------------- submit (real Laravel call, idempotent)
  const submit = async () => {
    if (!qrToken || lines.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    pendingKey.current ??= newIdempotencyKey(); // same key on retry → no duplicate order
    try {
      const res = await api.placeOrder(
        qrToken,
        { items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, modifier_ids: l.modifierIds })), note: note.trim() || undefined, guest_token: guestToken },
        pendingKey.current,
      );
      pendingKey.current = null;
      store.set(`noar.guest.${qrToken}`, res.guest_token);
      setGuestToken(res.guest_token);
      dispatch({ type: 'clear' });
      setNote('');
      setDrawer(false);
      setToast(`Поръчка № ${res.order.number} е изпратена · ${formatEur(res.order.total_cents)}`);
      void live.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429) pendingKey.current = null;
      setSubmitError(e instanceof ApiError ? e.message : 'Неуспешно изпращане. Опитайте отново.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);


  // ---------------------------------------------------------------- render
  if (loadError) return <FullscreenMessage title="Нещо се обърка" text={loadError} />;
  if (!ctx || activeCat === null) return <Loader />;

  const tableTitle = `Маса № ${pad2(ctx.table.number)}`;
  const routing = ctx.restaurant.accept_mode === 'auto' ? 'Директна поръчка към кухнята' : 'Поръчката се потвърждава от сервитьор';
  const count = cartCount(lines);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="linen-bg pointer-events-none fixed inset-0" />

      <OrderStatusTracker
        session={live.state}
        live={live.connected}
        open={tracker}
        onOpenChange={setTracker}
        onOrderMore={() => {
          setTracker(false);
          menuRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        }}
        onRequest={async (type) => {
          if (!guestToken) return;
          await api.serviceRequest(guestToken, type, newIdempotencyKey());
          await live.refresh();
        }}
      />

      <main className={`relative mx-auto max-w-[1180px] px-5 pb-36 ${live.state?.orders.length ? 'pt-16' : 'pt-6'} sm:px-6`} style={{ ['--pill-h' as string]: live.state?.orders.length ? '58px' : '0px' }}>
        <Header
          brand={ctx.restaurant.name}
          tableTitle={tableTitle}
          routing={routing}
          demoTables={directToken ? null : demoTables}
          currentNumber={ctx.table.number}
          onSwitch={(n) => router.replace(`/?table=${n}`)}
        />

        <div ref={menuRef} className="scroll-mt-20 pt-4">
          <MenuList
            categories={ctx.menu.categories}
            showBgn={ctx.restaurant.show_bgn}
            bgnRate={ctx.restaurant.bgn_rate}
            lines={lines}
            onAdd={(product, modifierIds) => dispatch({ type: 'add', product: productIndex.get(product.id) ?? product, modifierIds })}
            onInc={(key) => dispatch({ type: 'inc', key })}
            onDec={(key) => dispatch({ type: 'dec', key })}
          />
        </div>

        <footer className="mt-12 space-y-1 border-t border-ink/10 pt-6 text-center text-[11px] leading-relaxed text-ink-mute">
          <p>Цени в евро (EUR), с включен ДДС. {ctx.restaurant.show_bgn && 'Левовата равностойност е информативна (1 € = 1,95583 лв.).'}</p>
          <p>Хранителните стойности са ориентировъчни. За алергии, моля, попитайте персонала.</p>
          <p>Данните за поръчката се използват само за обслужването ѝ.</p>
        </footer>
      </main>

      {/* floating order bar */}
      <AnimatePresence>
        {count > 0 && !drawer && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="card mx-auto flex max-w-[640px] items-center gap-3 rounded-full p-2 pl-5">
              <div className="min-w-0 flex-1">
                <div className="truncate whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                  № {pad2(ctx.table.number)} · <span className="text-terra">{count} арт.</span>
                </div>
                <motion.div key={cartTotal(lines)} initial={reduced ? false : { scale: 1.08 }} animate={{ scale: 1 }} className="tabular origin-left font-display text-[22px] font-semibold leading-none">
                  {formatEur(cartTotal(lines))}
                </motion.div>
              </div>
              <MagneticButton
                onClick={() => {
                  setSubmitError(null);
                  setDrawer(true);
                }}
                className="h-12 shrink-0 rounded-full bg-terra px-5 text-[14px] font-bold text-paper shadow-[0_10px_24px_-10px_rgba(180,85,47,0.9)]"
              >
                Преглед на поръчката
              </MagneticButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <OrderDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        tableLabel={tableTitle}
        lines={lines}
        note={note}
        onNote={setNote}
        onInc={(key) => dispatch({ type: 'inc', key })}
        onDec={(key) => dispatch({ type: 'dec', key })}
        onRemove={(key) => dispatch({ type: 'remove', key })}
        onSubmit={submit}
        submitting={submitting}
        error={submitError}
        acceptMode={ctx.restaurant.accept_mode}
        showBgn={ctx.restaurant.show_bgn}
        bgnRate={ctx.restaurant.bgn_rate}
      />

      {/* non-blocking success toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className="card fixed inset-x-4 bottom-24 z-[95] mx-auto max-w-[420px] rounded-full px-4 py-3 text-center text-[13px] font-semibold text-ink"
            onClick={() => setTracker(true)}
          >
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-olive" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({
  brand,
  tableTitle,
  routing,
  demoTables,
  currentNumber,
  onSwitch,
}: {
  brand: string;
  tableTitle: string;
  routing: string;
  demoTables: DemoTable[] | null;
  currentNumber: number;
  onSwitch: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = brand.split(' ');
  return (
    <header className="relative">
      <div className="flex items-start justify-between gap-3">
        <h1 className="leading-none">
          <span className="block font-display text-[42px] font-semibold tracking-[0.02em] text-ink sm:text-[52px]">{first}</span>
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.45em] text-brass">{rest.join(' ')}</span>
        </h1>
        {demoTables && demoTables.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="rounded-full border border-dashed border-ink/20 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-mute hover:text-ink"
              title="Само за локално тестване"
            >
              Тест: маса ▾
            </button>
            <AnimatePresence>
              {open && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="card absolute right-0 z-[75] mt-2 grid w-56 grid-cols-5 gap-1 rounded-2xl p-2">
                  {demoTables.map((t) => (
                    <button
                      key={t.number}
                      onClick={() => {
                        setOpen(false);
                        onSwitch(t.number);
                      }}
                      className={`tabular h-9 rounded-lg text-[12px] font-semibold ${t.number === currentNumber ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-sand'}`}
                    >
                      {pad2(t.number)}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 rounded-full border border-ink/10 bg-paper/80 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-soft">
        <span className="text-ink">📍 {tableTitle}</span>
        <span className="text-ink/25">•</span>
        <span>{routing}</span>
      </p>
    </header>
  );
}

function Loader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-linen" role="status" aria-label="Зареждане на менюто">
      <div className="text-center">
        <div className="font-display text-5xl font-semibold text-ink">NOAR</div>
        <div className="mx-auto mt-4 h-px w-40 overflow-hidden bg-ink/10">
          <div className="h-full w-1/3 bg-brass" style={{ animation: 'loader-slide 1.2s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes loader-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
        <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-ink-mute">Зареждане</div>
      </div>
    </div>
  );
}

function FullscreenMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-linen px-6 text-center">
      <div>
        <div className="font-display text-4xl font-semibold">NOAR</div>
        <h1 className="mt-6 font-display text-lg">{title}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">{text}</p>
        <button onClick={() => window.location.reload()} className="mt-6 rounded-full border border-ink/20 bg-paper px-5 py-2.5 text-sm text-ink">
          Опитай отново
        </button>
      </div>
    </div>
  );
}
