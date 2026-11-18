import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatEur, mutate, type MenuProduct } from '@/lib/api';
import { useMenu } from '@/lib/queries';
import { cx } from '@/lib/format';
import { Button, Dialog, Empty, Input, Spinner, Textarea, toast } from './ui';
import { useAuth } from '@/lib/auth';

type Line = { key: string; product: MenuProduct; quantity: number; modifierIds: number[]; names: string[]; unit: number };

/** Manual waiter/cashier order entry against the live menu (server validates & prices). */
export function MenuPicker({ open, onClose, sessionId, tableLabel }: { open: boolean; onClose: () => void; sessionId: number; tableLabel: string }) {
  const { data, isLoading } = useMenu();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [configuring, setConfiguring] = useState<MenuProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setNote('');
    setQ('');
    const k = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const products = useMemo(() => {
    const all = (data?.products ?? []).filter((p) => p.is_published);
    const term = q.trim().toLowerCase();
    return all.filter((p) => (cat === 'all' || p.category_id === cat) && (!term || p.name.toLowerCase().includes(term)));
  }, [data, cat, q]);

  const add = (p: MenuProduct, modifierIds: number[]) => {
    const key = `${p.id}:${[...modifierIds].sort().join('.')}`;
    const opts = p.modifier_groups.flatMap((g) => g.options).filter((o) => modifierIds.includes(o.id));
    setLines((ls) => {
      const ex = ls.find((l) => l.key === key);
      if (ex) return ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key, product: p, quantity: 1, modifierIds, names: opts.map((o) => o.name), unit: p.price_cents + opts.reduce((s, o) => s + o.price_delta_cents, 0) }];
    });
  };
  const pick = (p: MenuProduct) => (p.modifier_groups.length ? setConfiguring(p) : add(p, []));
  const total = lines.reduce((s, l) => s + l.unit * l.quantity, 0);

  const submit = async () => {
    setSaving(true);
    try {
      await mutate(`/sessions/${sessionId}/orders`, 'POST', { items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, modifier_ids: l.modifierIds })), note: note || null }, true);
      toast.ok(`Поръчката за ${tableLabel} е изпратена към кухнята/бара`);
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Нова поръчка · ${tableLabel}`} subtitle="Натиснете / за търсене" size="xl">
      {isLoading || !data ? (
        <div className="grid h-60 place-items-center"><Spinner /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Търсене на артикул…" className="pl-9" />
            </div>
            <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
              {[{ id: 'all' as const, name: 'Всички' }, ...data.categories.filter((c) => c.is_active)].map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)} className={cx('h-9 shrink-0 rounded-xl px-3 text-[13px] font-semibold', cat === c.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg')}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  disabled={!p.is_available}
                  onClick={() => pick(p)}
                  className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-line bg-surface-2 p-3 text-left transition hover:border-line-strong active:scale-[0.98] disabled:opacity-40"
                >
                  <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{p.name}</span>
                  <span className="mt-2 flex items-center justify-between text-[12.5px]">
                    <span className="tabular text-muted">{formatEur(p.price_cents)}</span>
                    {!p.is_available ? <span className="text-[11px] text-danger">Изчерпано</span> : <Plus className="h-4 w-4 text-subtle group-hover:text-accent" />}
                  </span>
                </button>
              ))}
            </div>
            {products.length === 0 && <Empty title="Няма намерени артикули" />}
          </div>

          <div className="flex flex-col rounded-2xl border border-line bg-surface-2 p-3 lg:sticky lg:top-0 lg:max-h-[70vh]">
            <div className="px-1 text-[13px] font-semibold">Количка</div>
            <div className="scrollbar-thin mt-2 flex-1 space-y-1 overflow-y-auto">
              {lines.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-subtle">Изберете артикули отляво.</p>}
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{l.product.name}</div>
                    {l.names.length > 0 && <div className="truncate text-[11.5px] text-muted">{l.names.join(' · ')}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-3" onClick={() => setLines((ls) => ls.flatMap((x) => (x.key !== l.key ? [x] : x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : [])))} aria-label="Намали">
                      {l.quantity > 1 ? <Minus className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
                    </button>
                    <span className="tabular w-5 text-center text-[13px] font-semibold">{l.quantity}</span>
                    <button className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-3" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: x.quantity + 1 } : x)))} aria-label="Увеличи">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Бележка към кухнята" className="mt-2 text-[13px]" />
            <div className="mt-3 flex items-center justify-between px-1 text-sm">
              <span className="text-muted">Ориентировъчно</span>
              <span className="tabular font-semibold">{formatEur(total)}</span>
            </div>
            <Button variant="primary" size="lg" className="mt-2" disabled={lines.length === 0} loading={saving} onClick={submit}>
              Изпрати поръчката
            </Button>
          </div>
        </div>
      )}
      <ModifierDialog product={configuring} onClose={() => setConfiguring(null)} onConfirm={(ids) => { if (configuring) add(configuring, ids); setConfiguring(null); }} />
    </Dialog>
  );
}

function ModifierDialog({ product, onClose, onConfirm }: { product: MenuProduct | null; onClose: () => void; onConfirm: (ids: number[]) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => {
    setSel(product?.modifier_groups.filter((g) => g.min > 0).map((g) => g.options[0]?.id).filter((x): x is number => !!x) ?? []);
  }, [product]);
  if (!product) return null;
  const valid = product.modifier_groups.every((g) => {
    const c = g.options.filter((o) => sel.includes(o.id)).length;
    return c >= g.min && c <= g.max;
  });
  return (
    <Dialog open={!!product} onClose={onClose} title={product.name} size="sm" footer={<Button variant="primary" className="w-full" disabled={!valid} onClick={() => onConfirm(sel)}>Добави</Button>}>
      <div className="space-y-4">
        {product.modifier_groups.map((g) => (
          <div key={g.id}>
            <div className="mb-2 text-[12.5px] font-semibold text-muted">{g.name} {g.min > 0 ? '(задължително)' : `(до ${g.max})`}</div>
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => {
                const on = sel.includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() =>
                      setSel((cur) => {
                        const ids = g.options.map((x) => x.id);
                        if (g.max === 1) return [...cur.filter((x) => !ids.includes(x)), o.id];
                        if (on) return cur.filter((x) => x !== o.id);
                        return cur.filter((x) => ids.includes(x)).length >= g.max ? cur : [...cur, o.id];
                      })
                    }
                    className={cx('h-10 rounded-xl border px-3 text-[13px] font-medium', on ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted')}
                  >
                    {o.name} {o.price_delta_cents ? <span className="tabular text-subtle">+{formatEur(o.price_delta_cents)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
