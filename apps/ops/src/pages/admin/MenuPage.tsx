import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { API_ORIGIN, bApi, formatEur, mutate, type MenuData, type MenuProduct } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useMenu } from '@/lib/queries';
import { cx, parseEurInput } from '@/lib/format';
import { Badge, Button, Card, Dialog, Empty, Field, Input, Segmented, Select, Spinner, Textarea, Toggle, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

const signedCents = (v: string) => {
  const n = Number(v.replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const ALLERGENS = ['глутен', 'ракообразни', 'яйца', 'риба', 'фъстъци', 'соя', 'мляко', 'ядки', 'целина', 'горчица', 'сусам', 'серен диоксид', 'лупина', 'мекотели', 'алкохол'];

export function MenuPage() {
  const { data, isLoading } = useMenu();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [cat, setCat] = useState<number | null>(null);
  const [editing, setEditing] = useState<MenuProduct | 'new' | null>(null);
  const [catEdit, setCatEdit] = useState<{ id?: number; name: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['b', branchId] });

  if (isLoading || !data) return <div className="grid h-60 place-items-center"><Spinner /></div>;
  const activeCat = cat ?? data.categories[0]?.id ?? null;
  const products = data.products.filter((p) => p.category_id === activeCat);

  const toggle = async (p: MenuProduct) => {
    try {
      await mutate(`/products/${p.id}/availability`, 'PATCH', { is_available: !p.is_available });
      toast.ok(p.is_available ? `„${p.name}“ е маркиран като изчерпан` : `„${p.name}“ е наличен отново`);
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Меню"
        subtitle="Категории, продукти, варианти, добавки, алергени и маршрутизиране към станции"
        action={
          <div className="flex gap-2">
            <Button icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>CSV импорт</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Нов продукт</Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          {data.categories.map((c) => (
            <div key={c.id} className={cx('group flex items-center rounded-xl', c.id === activeCat && 'bg-surface-3')}>
              <button onClick={() => setCat(c.id)} className="flex h-10 flex-1 items-center justify-between px-3 text-left text-[13.5px] font-medium">
                <span className={cx(!c.is_active && 'text-subtle line-through')}>{c.name}</span>
                <span className="tabular text-[12px] text-subtle">{data.products.filter((p) => p.category_id === c.id).length}</span>
              </button>
              <button onClick={() => setCatEdit({ id: c.id, name: c.name })} className="mr-1 grid h-8 w-8 place-items-center rounded-lg text-subtle opacity-0 hover:text-fg group-hover:opacity-100" aria-label="Преименувай"><Pencil className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setCatEdit({ name: '' })} className="mt-1 flex h-10 w-full items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-accent hover:bg-surface-2"><Plus className="h-4 w-4" /> Категория</button>
        </Card>

        <Card className="overflow-hidden">
          {products.length === 0 ? <Empty title="Няма продукти в категорията" action={<Button onClick={() => setEditing('new')}>Добави продукт</Button>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead className="border-b border-line text-left text-[12px] text-muted">
                  <tr><th className="px-4 py-3 font-medium">Продукт</th><th className="px-3 py-3 font-medium">Станция</th><th className="px-3 py-3 text-right font-medium">Цена</th><th className="px-3 py-3 font-medium">Рецепта</th><th className="px-3 py-3 font-medium">Наличен</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{p.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">{p.modifier_groups.map((g) => <Badge key={g.id}>{g.name}</Badge>)}{!p.is_published && <Badge tone="warn">Скрит</Badge>}</div>
                      </td>
                      <td className="px-3 py-3 text-muted">{data.stations.find((s) => s.id === p.station_id)?.name ?? '—'}</td>
                      <td className="tabular px-3 py-3 text-right font-semibold">{formatEur(p.price_cents)}</td>
                      <td className="px-3 py-3">{p.has_recipe ? <Badge tone="ok">Да</Badge> : <Badge>Не</Badge>}</td>
                      <td className="px-3 py-3"><Toggle checked={p.is_available} onChange={() => toggle(p)} label="Наличност" /></td>
                      <td className="px-3 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(p)} icon={<Pencil className="h-3.5 w-3.5" />}>Редакция</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ProductDialog product={editing} data={data} defaultCategory={activeCat} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />
      <CategoryDialog value={catEdit} onClose={() => setCatEdit(null)} onSaved={() => { setCatEdit(null); void refresh(); }} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void refresh(); }} />
    </div>
  );
}

function CategoryDialog({ value, onClose, onSaved }: { value: { id?: number; name: string } | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(value?.name ?? ''), [value]);
  const save = async () => {
    try {
      await mutate(value?.id ? `/categories/${value.id}` : '/categories', value?.id ? 'PUT' : 'POST', { name });
      toast.ok('Категорията е запазена');
      onSaved();
    } catch (e) {
      toast.error(e);
    }
  };
  const del = async () => {
    try {
      await mutate(`/categories/${value!.id}`, 'DELETE');
      toast.ok('Категорията е изтрита');
      onSaved();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Dialog open={!!value} onClose={onClose} title={value?.id ? 'Категория' : 'Нова категория'} size="sm" footer={<div className="flex gap-2">{value?.id && <Button variant="danger" onClick={del}>Изтрий</Button>}<Button variant="primary" className="flex-1" disabled={!name.trim()} onClick={save}>Запази</Button></div>}>
      <Field label="Име"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    </Dialog>
  );
}

type Group = { name: string; kind: 'variant' | 'modifier'; min: number; max: number; options: Array<{ name: string; price: string }> };

function ProductDialog({ product, data, defaultCategory, onClose, onSaved }: { product: MenuProduct | 'new' | null; data: MenuData; defaultCategory: number | null; onClose: () => void; onSaved: () => void }) {
  const can = useCan();
  const [tab, setTab] = useState<'main' | 'mods' | 'recipe'>('main');
  const [f, setF] = useState<Record<string, string>>({});
  const [allergens, setAllergens] = useState<string[]>([]);
  const [flags, setFlags] = useState({ is_available: true, is_published: true, auto_unavailable_on_low_stock: false });
  const [groups, setGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!product) return;
    setTab('main');
    setErrors({});
    const p = product === 'new' ? null : product;
    setF({
      name: p?.name ?? '', category_id: String(p?.category_id ?? defaultCategory ?? ''), station_id: String(p?.station_id ?? data.stations[0]?.id ?? ''),
      price: p ? (p.price_cents / 100).toFixed(2) : '', description: p?.description ?? '', ingredients: p?.ingredients ?? '', portion: p?.portion ?? '',
      image_url: p?.image_url ?? '', kcal: String(p?.nutrition?.kcal ?? ''), protein: String(p?.nutrition?.protein ?? ''), fat: String(p?.nutrition?.fat ?? ''), carbs: String(p?.nutrition?.carbs ?? ''),
      vat: String((p?.vat_rate_bps ?? 2000) / 100),
    });
    setAllergens(p?.allergens ?? []);
    setFlags({ is_available: p?.is_available ?? true, is_published: p?.is_published ?? true, auto_unavailable_on_low_stock: p?.auto_unavailable_on_low_stock ?? false });
    setGroups(p?.modifier_groups.map((g) => ({ name: g.name, kind: g.kind, min: g.min, max: g.max, options: g.options.map((o) => ({ name: o.name, price: (o.price_delta_cents / 100).toFixed(2) })) })) ?? []);
  }, [product, data, defaultCategory]);

  if (!product) return null;
  const existing = product === 'new' ? null : product;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  const save = async () => {
    setSaving(true);
    setErrors({});
    const hasNutrition = ['kcal', 'protein', 'fat', 'carbs'].some((k) => f[k]?.trim());
    try {
      await mutate(existing ? `/products/${existing.id}` : '/products', existing ? 'PUT' : 'POST', {
        name: f.name, category_id: Number(f.category_id), station_id: f.station_id ? Number(f.station_id) : null,
        price_cents: parseEurInput(f.price) ?? -1, description: f.description || null, ingredients: f.ingredients || null, portion: f.portion || null,
        image_url: f.image_url || null, allergens, vat_rate_bps: Math.round(Number(f.vat || 20) * 100), ...flags,
        nutrition: hasNutrition ? { kcal: num(f.kcal), protein: num(f.protein), fat: num(f.fat), carbs: num(f.carbs), is_estimate: true } : null,
        art: existing?.art ?? { style: 'salad', base: '#7fa34a', accents: ['#e8d9a8', '#c9a24a', '#f5f0e1'] },
        modifier_groups: groups.map((g) => ({ ...g, options: g.options.map((o) => ({ name: o.name, price_delta_cents: signedCents(o.price) })) })),
      });
      toast.ok('Продуктът е запазен');
      onSaved();
    } catch (e) {
      const err = e as { details?: Record<string, string[]> };
      if (err.details) setErrors(err.details);
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing || !confirm(`Изтриване на „${existing.name}“? Историята на продажбите се запазва.`)) return;
    try {
      await mutate(`/products/${existing.id}`, 'DELETE');
      toast.ok('Продуктът е изтрит');
      onSaved();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open onClose={onClose} title={existing ? existing.name : 'Нов продукт'} size="lg" side="right"
      footer={<div className="flex gap-2">{existing && <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Изтрий</Button>}<Button variant="primary" className="flex-1" loading={saving} onClick={save}>Запази</Button></div>}>
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: 'main', label: 'Основни' }, { value: 'mods', label: `Варианти и добавки (${groups.length})` }, ...(existing && can('inventory.view') ? [{ value: 'recipe' as const, label: 'Рецепта' }] : [])]} />
      {tab === 'main' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Име" className="sm:col-span-2" error={errors.name?.[0]}><Input value={f.name} onChange={set('name')} /></Field>
          <Field label="Категория"><Select value={f.category_id} onChange={set('category_id')}>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Станция за приготвяне" hint="Къде се изпраща поръчката"><Select value={f.station_id} onChange={set('station_id')}>{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Цена (€, с ДДС)" error={errors.price_cents?.[0]}><Input inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label="ДДС %"><Input inputMode="decimal" value={f.vat} onChange={set('vat')} /></Field>
          <Field label="Порция"><Input value={f.portion} onChange={set('portion')} placeholder="напр. 320 г" /></Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">Снимка на ястието (отгоре, квадратна — показва се в чинията на масата)</div>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">{f.image_url && <img src={f.image_url} alt="" className="h-full w-full object-cover" />}</div>
              {existing ? (
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
                  Качи снимка
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append('image', file);
                    try {
                      const res = await fetch(`${API_ORIGIN}/api/v1/branches/${useAuth.getState().branchId}/products/${existing.id}/image`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${useAuth.getState().token}`, Accept: 'application/json' } });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json?.error?.details?.image?.[0] ?? json?.error?.message ?? 'Грешка при качване');
                      setF((cur) => ({ ...cur, image_url: json.product.image_url }));
                      toast.ok('Снимката е качена');
                    } catch (err) {
                      toast.error(err);
                    }
                  }} />
                </label>
              ) : <span className="text-[12px] text-subtle">Запазете продукта, след това качете снимка.</span>}
              {f.image_url && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, image_url: '' })}>Премахни</Button>}
            </div>
            {errors.image_url?.[0] && <p className="mt-1 text-[11.5px] text-danger">{errors.image_url[0]}</p>}
          </div>
          <Field label="Описание" className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={set('description')} /></Field>
          <Field label="Съставки" className="sm:col-span-2"><Textarea rows={2} value={f.ingredients} onChange={set('ingredients')} /></Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">Алергени</div>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENS.map((a) => {
                const on = allergens.includes(a);
                return <button key={a} type="button" onClick={() => setAllergens(on ? allergens.filter((x) => x !== a) : [...allergens, a])} className={cx('h-8 rounded-lg border px-2.5 text-[12.5px]', on ? 'border-accent bg-accent-soft' : 'border-line text-muted')}>{a}</button>;
              })}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[12.5px] font-medium text-muted">Хранителни стойности на порция (ориентировъчни)</div>
            <div className="grid grid-cols-4 gap-2">
              {[['kcal', 'Калории'], ['protein', 'Протеини г'], ['fat', 'Мазнини г'], ['carbs', 'Въглехидрати г']].map(([k, l]) => <Field key={k} label={l}><Input inputMode="decimal" value={f[k]} onChange={set(k)} /></Field>)}
            </div>
          </div>
          <div className="space-y-3 sm:col-span-2">
            {([['is_available', 'Наличен за поръчка'], ['is_published', 'Видим в QR менюто'], ['auto_unavailable_on_low_stock', 'Скрий автоматично при ниска наличност на съставка']] as const).map(([k, l]) => (
              <div key={k} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[13.5px]">{l}<Toggle checked={flags[k]} onChange={(v) => setFlags({ ...flags, [k]: v })} label={l} /></div>
            ))}
          </div>
        </div>
      )}
      {tab === 'mods' && (
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <Card key={gi} className="p-3">
              <div className="grid grid-cols-[1fr_130px_70px_70px_36px] items-end gap-2">
                <Field label="Група"><Input value={g.name} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))} /></Field>
                <Field label="Тип"><Select value={g.kind} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, kind: e.target.value as Group['kind'] } : x)))}><option value="variant">Вариант</option><option value="modifier">Добавка</option></Select></Field>
                <Field label="Мин."><Input type="number" min={0} value={g.min} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, min: Number(e.target.value) } : x)))} /></Field>
                <Field label="Макс."><Input type="number" min={1} value={g.max} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, max: Number(e.target.value) } : x)))} /></Field>
                <Button variant="ghost" size="sm" aria-label="Премахни групата" onClick={() => setGroups(groups.filter((_, i) => i !== gi))} icon={<X className="h-4 w-4" />} />
              </div>
              <div className="mt-2 space-y-1.5">
                {g.options.map((o, oi) => (
                  <div key={oi} className="grid grid-cols-[1fr_110px_36px] gap-2">
                    <Input value={o.name} placeholder="Опция" onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, options: x.options.map((y, j) => (j === oi ? { ...y, name: e.target.value } : y)) } : x)))} />
                    <Input value={o.price} placeholder="+0,00 €" inputMode="decimal" onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, options: x.options.map((y, j) => (j === oi ? { ...y, price: e.target.value } : y)) } : x)))} />
                    <Button variant="ghost" size="sm" aria-label="Премахни" onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x)))} icon={<X className="h-4 w-4" />} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, options: [...x.options, { name: '', price: '0' }] } : x)))}>Опция</Button>
              </div>
            </Card>
          ))}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setGroups([...groups, { name: 'Добавки', kind: 'modifier', min: 0, max: 2, options: [{ name: '', price: '0' }] }])}>Нова група</Button>
        </div>
      )}
      {tab === 'recipe' && existing && <RecipeEditor productId={existing.id} />}
    </Dialog>
  );
}

function RecipeEditor({ productId }: { productId: number }) {
  const can = useCan();
  const [rows, setRows] = useState<Array<{ ingredient_id: number; quantity: string }> | null>(null);
  const [ings, setIngs] = useState<Array<{ id: number; name: string; unit: string }>>([]);
  useEffect(() => {
    Promise.all([bApi<{ data: Array<{ ingredient_id: number; quantity: number }> }>(`/products/${productId}/recipe`), bApi<{ data: Array<{ id: number; name: string; unit: string }> }>('/ingredients')])
      .then(([r, i]) => { setRows(r.data.map((x) => ({ ingredient_id: x.ingredient_id, quantity: String(x.quantity) }))); setIngs(i.data); })
      .catch(toast.error);
  }, [productId]);
  if (!rows) return <Spinner />;
  const save = async () => {
    try {
      await mutate(`/products/${productId}/recipe`, 'PUT', { items: rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity.replace(',', '.')) })) });
      toast.ok('Рецептата е запазена');
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] text-muted">Количество съставки за 1 порция. Резервира се при приемане на поръчката и се изписва, когато ястието е маркирано „Готово“. Без рецепта — няма складово движение.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2">
          <Select value={r.ingredient_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)))}>{ings.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</Select>
          <Input inputMode="decimal" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
          <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} icon={<X className="h-4 w-4" />} aria-label="Премахни" />
        </div>
      ))}
      {can('inventory.manage') && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled={!ings.length} onClick={() => setRows([...rows, { ingredient_id: ings[0].id, quantity: '1' }])}>Съставка</Button>
          <Button size="sm" variant="primary" onClick={save}>Запази рецептата</Button>
        </div>
      )}
    </div>
  );
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('name;category;price;station_code;description;allergens\nТрюфелни картофки;Основни ястия;6,90;hot;Хрупкави картофки с трюфел;мляко\nАперол Шприц;Напитки и коктейли;9,50;bar;Класически;алкохол');
  const [preview, setPreview] = useState<null | { rows: Array<{ line: number; name: string; category: string; price_cents: number | null; station_code: string | null; errors: string[] }>; errors: string[] }>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const r = await mutate<{ preview: boolean; rows: never; errors: string[]; created?: number }>('/menu/import', 'POST', { csv, preview: dry });
      if (dry || r.preview) setPreview(r as never);
      else { toast.ok(`Импортирани продукти: ${r.created}`); setPreview(null); onDone(); }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Импорт от CSV" subtitle="Колони: name; category; price; station_code (hot/cold/bar/dessert); description; allergens" size="lg"
      footer={<div className="flex gap-2"><Button onClick={() => run(true)} loading={busy}>Преглед</Button><Button variant="primary" className="flex-1" disabled={!preview || preview.errors.length > 0} loading={busy} onClick={() => run(false)}>Импортирай {preview?.rows.length ?? ''}</Button></div>}>
      <Textarea rows={7} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} className="font-mono text-[12px]" />
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[13px] text-accent">
        <FileUp className="h-4 w-4" /> Зареди файл
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setCsv(await file.text()); setPreview(null); } }} />
      </label>
      {preview && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-left text-muted"><tr><th className="px-3 py-2">Ред</th><th className="px-3 py-2">Име</th><th className="px-3 py-2">Категория</th><th className="px-3 py-2">Цена</th><th className="px-3 py-2">Станция</th><th className="px-3 py-2">Статус</th></tr></thead>
            <tbody className="divide-y divide-line">
              {preview.rows.map((r) => (
                <tr key={r.line}><td className="px-3 py-2">{r.line}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.category}</td><td className="tabular px-3 py-2">{r.price_cents !== null ? formatEur(r.price_cents) : '—'}</td><td className="px-3 py-2">{r.station_code}</td><td className="px-3 py-2">{r.errors.length ? <Badge tone="danger">{r.errors.join(', ')}</Badge> : <Badge tone="ok">OK</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
