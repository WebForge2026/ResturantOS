import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, Plus, Scale, Trash2 } from 'lucide-react';
import { mutate } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { cx } from '@/lib/format';
import { Badge, Button, Card, Dialog, Empty, Field, Input, Segmented, Select, Spinner, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

type Ingredient = { id: number; name: string; unit: string; on_hand: number; reserved: number; available: number; min_level: number; reorder_qty: number; location: string; supplier: { id: number; name: string } | null; is_low: boolean };
type Reorder = { ingredient_id: number; name: string; unit: string; on_hand: number; min_level: number; suggested_qty: number; supplier: string | null };
type Movement = { id: number; type: string; quantity: number; on_hand_after: number; reserved_after: number; ingredient: { id: number; name: string; unit: string } | null; order_item_id: number | null; user: string | null; note: string | null; created_at: string };
type Supplier = { id: number; name: string; contact_name: string | null; phone: string | null; email: string | null };

const MOVE: Record<string, { label: string; tone: 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'accent' }> = {
  reserve: { label: 'Резервация', tone: 'info' },
  release: { label: 'Освобождаване', tone: 'neutral' },
  consume: { label: 'Изписване', tone: 'accent' },
  receipt: { label: 'Доставка', tone: 'ok' },
  adjust: { label: 'Инвентаризация', tone: 'warn' },
  waste: { label: 'Брак', tone: 'danger' },
  opening: { label: 'Начално', tone: 'neutral' },
};

const unitLabel = (u: string) => ({ g: 'г', ml: 'мл', pcs: 'бр.' })[u] ?? u;
const qty = (n: number, u: string) => `${new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 3 }).format(n)} ${unitLabel(u)}`;

export function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'moves' | 'receive' | 'suppliers'>('stock');
  return (
    <div>
      <PageHeader title="Склад" subtitle="Рецепти, резервации, изписване и движения — всяко движение е в главната книга" action={<Segmented value={tab} onChange={setTab} options={[{ value: 'stock', label: 'Наличности' }, { value: 'moves', label: 'Движения' }, { value: 'receive', label: 'Доставка' }, { value: 'suppliers', label: 'Доставчици' }]} />} />
      {tab === 'stock' && <Stock />}
      {tab === 'moves' && <Moves />}
      {tab === 'receive' && <Receive onDone={() => setTab('moves')} />}
      {tab === 'suppliers' && <Suppliers />}
    </div>
  );
}

function Stock() {
  const can = useCan();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const { data, isLoading } = useBranchQuery<{ data: Ingredient[]; reorder: Reorder[] }>(['ingredients'], '/ingredients', { refetchInterval: 30000 });
  const [adj, setAdj] = useState<{ ing: Ingredient; type: 'count' | 'waste' } | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ name: '', unit: 'g', min_level: '0', opening_qty: '0' });

  if (isLoading || !data) return <div className="grid h-60 place-items-center"><Spinner /></div>;
  const refresh = () => qc.invalidateQueries({ queryKey: ['b', branchId] });

  const submitAdj = async () => {
    if (!adj) return;
    try {
      await mutate(`/ingredients/${adj.ing.id}/adjust`, 'POST', { type: adj.type, quantity: Number(value.replace(',', '.')), note: note || null });
      toast.ok(adj.type === 'waste' ? 'Бракът е записан' : 'Наличността е коригирана');
      setAdj(null);
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  const create = async () => {
    try {
      await mutate('/ingredients', 'POST', { name: nf.name, unit: nf.unit, min_level: Number(nf.min_level), opening_qty: Number(nf.opening_qty) });
      toast.ok('Съставката е добавена');
      setCreating(false);
      setNf({ name: '', unit: 'g', min_level: '0', opening_qty: '0' });
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-4">
      {data.reorder.length > 0 && (
        <Card className="border-warn/40 p-4">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle className="h-4 w-4 text-warn" /> Предложение за зареждане (правило: под минимума → до 2× минимума)</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.reorder.map((r) => (
              <div key={r.ingredient_id} className="rounded-xl bg-warn-soft px-3 py-2 text-[13px]"><b>{r.name}</b> — поръчай {qty(r.suggested_qty, r.unit)}<div className="text-[12px] text-muted">налично {qty(r.on_hand, r.unit)} · мин. {qty(r.min_level, r.unit)}{r.supplier ? ` · ${r.supplier}` : ''}</div></div>
            ))}
          </div>
        </Card>
      )}
      <div className="flex justify-end">{can('inventory.manage') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Съставка</Button>}</div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead className="border-b border-line text-left text-[12px] text-muted"><tr><th className="px-4 py-3 font-medium">Съставка</th><th className="px-3 py-3 text-right font-medium">Наличност</th><th className="px-3 py-3 text-right font-medium">Резервирано</th><th className="px-3 py-3 text-right font-medium">Свободно</th><th className="px-3 py-3 text-right font-medium">Минимум</th><th className="px-3 py-3 font-medium">Доставчик</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {data.data.map((i) => (
              <tr key={i.id} className={cx(i.is_low && 'bg-warn-soft/40')}>
                <td className="px-4 py-3 font-semibold">{i.name} {i.is_low && <Badge tone="warn" className="ml-1">Ниско</Badge>}</td>
                <td className="tabular px-3 py-3 text-right">{qty(i.on_hand, i.unit)}</td>
                <td className="tabular px-3 py-3 text-right text-info">{qty(i.reserved, i.unit)}</td>
                <td className="tabular px-3 py-3 text-right font-semibold">{qty(i.available, i.unit)}</td>
                <td className="tabular px-3 py-3 text-right text-muted">{qty(i.min_level, i.unit)}</td>
                <td className="px-3 py-3 text-muted">{i.supplier?.name ?? '—'}</td>
                <td className="px-3 py-3 text-right">
                  {can('inventory.manage') && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<Scale className="h-3.5 w-3.5" />} onClick={() => { setAdj({ ing: i, type: 'count' }); setValue(String(i.on_hand)); setNote(''); }}>Броене</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { setAdj({ ing: i, type: 'waste' }); setValue(''); setNote(''); }}>Брак</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={!!adj} onClose={() => setAdj(null)} title={adj?.type === 'waste' ? `Брак · ${adj?.ing.name}` : `Инвентаризация · ${adj?.ing.name}`} size="sm" footer={<Button variant="primary" className="w-full" onClick={submitAdj} disabled={!value}>Запиши</Button>}>
        <div className="space-y-3">
          <Field label={adj?.type === 'waste' ? `Количество за брак (${unitLabel(adj?.ing.unit ?? '')})` : `Преброено количество (${unitLabel(adj?.ing.unit ?? '')})`} hint={adj?.type === 'count' ? `Системна наличност: ${adj ? qty(adj.ing.on_hand, adj.ing.unit) : ''}` : undefined}>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
          <Field label="Бележка"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Dialog>
      <Dialog open={creating} onClose={() => setCreating(false)} title="Нова съставка" size="sm" footer={<Button variant="primary" className="w-full" disabled={!nf.name} onClick={create}>Добави</Button>}>
        <div className="grid gap-3">
          <Field label="Име"><Input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></Field>
          <Field label="Мерна единица"><Select value={nf.unit} onChange={(e) => setNf({ ...nf, unit: e.target.value })}><option value="g">грам (г)</option><option value="ml">милилитър (мл)</option><option value="pcs">брой</option></Select></Field>
          <Field label="Минимално ниво"><Input inputMode="decimal" value={nf.min_level} onChange={(e) => setNf({ ...nf, min_level: e.target.value })} /></Field>
          <Field label="Начално количество"><Input inputMode="decimal" value={nf.opening_qty} onChange={(e) => setNf({ ...nf, opening_qty: e.target.value })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

function Moves() {
  const [type, setType] = useState('');
  const { data, isLoading } = useBranchQuery<{ data: Movement[] }>(['moves', type], `/stock-movements${type ? `?type=${type}` : ''}`, { refetchInterval: 20000 });
  return (
    <div className="space-y-3">
      <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56"><option value="">Всички движения</option>{Object.entries(MOVE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      <Card className="overflow-x-auto">
        {isLoading || !data ? <div className="grid h-40 place-items-center"><Spinner /></div> : data.data.length === 0 ? <Empty title="Няма движения" /> : (
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="border-b border-line text-left text-[12px] text-muted"><tr><th className="px-4 py-3 font-medium">Време</th><th className="px-3 py-3 font-medium">Тип</th><th className="px-3 py-3 font-medium">Съставка</th><th className="px-3 py-3 text-right font-medium">Количество</th><th className="px-3 py-3 text-right font-medium">Наличност след</th><th className="px-3 py-3 font-medium">Източник</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.data.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 text-muted">{new Date(m.created_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-2.5"><Badge tone={MOVE[m.type]?.tone}>{MOVE[m.type]?.label ?? m.type}</Badge></td>
                  <td className="px-3 py-2.5">{m.ingredient?.name}</td>
                  <td className={cx('tabular px-3 py-2.5 text-right font-semibold', m.quantity < 0 ? 'text-danger' : 'text-ok')}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity, m.ingredient?.unit ?? '')}</td>
                  <td className="tabular px-3 py-2.5 text-right text-muted">{qty(m.on_hand_after, m.ingredient?.unit ?? '')}</td>
                  <td className="px-3 py-2.5 text-muted">{m.order_item_id ? `Поръчка (ред ${m.order_item_id})` : m.note ?? m.user ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Receive({ onDone }: { onDone: () => void }) {
  const { data } = useBranchQuery<{ data: Ingredient[] }>(['ingredients'], '/ingredients');
  const sup = useBranchQuery<{ data: Supplier[] }>(['suppliers'], '/suppliers');
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [supplier, setSupplier] = useState('');
  const [ref, setRef] = useState('');
  const [rows, setRows] = useState<Array<{ ingredient_id: number; quantity: string; total: string }>>([]);
  if (!data || !sup.data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const submit = async () => {
    try {
      await mutate('/stock-receipts', 'POST', {
        supplier_id: supplier ? Number(supplier) : null, reference: ref || null,
        items: rows.map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity.replace(',', '.')), total_cents: Math.round(Number(r.total.replace(',', '.') || 0) * 100) })),
      }, true);
      toast.ok('Доставката е заприходена');
      setRows([]);
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
      onDone();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Card className="max-w-3xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Доставчик"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">—</option>{sup.data.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Документ №"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="напр. фактура 0000123" /></Field>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_110px_36px] gap-2">
            <Select value={r.ingredient_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)))}>{data.data.map((g) => <option key={g.id} value={g.id}>{g.name} ({unitLabel(g.unit)})</option>)}</Select>
            <Input placeholder="Кол." inputMode="decimal" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
            <Input placeholder="Сума €" inputMode="decimal" value={r.total} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))} />
            <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Премахни" icon={<Trash2 className="h-4 w-4" />} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setRows([...rows, { ingredient_id: data.data[0]?.id, quantity: '', total: '' }])}>Ред</Button>
        <Button variant="primary" icon={<PackagePlus className="h-4 w-4" />} disabled={!rows.length || rows.some((r) => !(Number(r.quantity.replace(',', '.')) > 0))} onClick={submit}>Заприходи</Button>
      </div>
    </Card>
  );
}

function Suppliers() {
  const { data } = useBranchQuery<{ data: Supplier[] }>(['suppliers'], '/suppliers');
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [f, setF] = useState({ name: '', contact_name: '', phone: '', email: '' });
  if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const add = async () => {
    try {
      await mutate('/suppliers', 'POST', { ...f, email: f.email || null });
      toast.ok('Доставчикът е добавен');
      setF({ name: '', contact_name: '', phone: '', email: '' });
      void qc.invalidateQueries({ queryKey: ['b', branchId, 'suppliers'] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="divide-y divide-line">
        {data.data.map((s) => <div key={s.id} className="px-5 py-3.5 text-[13.5px]"><div className="font-semibold">{s.name}</div><div className="text-[12.5px] text-muted">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || '—'}</div></div>)}
      </Card>
      <Card className="h-fit space-y-3 p-5">
        <div className="text-[14px] font-semibold">Нов доставчик</div>
        <Field label="Име"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Лице за контакт"><Input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></Field>
        <Field label="Телефон"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Имейл"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Button variant="primary" className="w-full" disabled={!f.name} onClick={add}>Добави</Button>
      </Card>
    </div>
  );
}
