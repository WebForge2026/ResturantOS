import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { formatEur, type LiveTable } from '@/lib/api';
import { useBranchQuery } from '@/lib/queries';
import { Card, CardHeader, Empty, Segmented, Spinner, Stat, Badge } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

export type Summary = {
  kpi: { sales_cents: number; tips_cents: number; orders: number; cancelled_orders: number; avg_check_cents: number; checks_paid: number; active_tables: number; items_sold: number; discounts_cents: number; voided_items: number };
  payments_by_method: Array<{ method: string; amount_cents: number; count: number }>;
  top_items: Array<{ product_id: number; name: string; quantity: number; revenue_cents: number }>;
  by_hour: Array<{ hour: string; sales_cents: number; orders: number }>;
  by_day: Array<{ date: string; sales_cents: number }>;
  avg_prep_seconds: number | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const rangeFor = (r: 'today' | '7d' | '30d') => {
  const to = new Date();
  const from = new Date();
  if (r === '7d') from.setDate(from.getDate() - 6);
  if (r === '30d') from.setDate(from.getDate() - 29);
  return { from: iso(from), to: iso(to) };
};

export const ChartTip = ({ active, payload, label, money = true }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; money?: boolean }) =>
  active && payload?.length ? (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-xl">
      <div className="text-muted">{label}</div>
      <div className="tabular font-semibold">{money ? formatEur(payload[0].value) : payload[0].value}</div>
    </div>
  ) : null;

export function DashboardPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  const { from, to } = rangeFor(range);
  const { data, isLoading } = useBranchQuery<Summary>(['summary', from, to], `/reports/summary?from=${from}&to=${to}`, { refetchInterval: 30000 });
  const live = useBranchQuery<{ tables: LiveTable[] }>(['tables-live'], '/tables-live', { refetchInterval: 15000 });
  const stock = useBranchQuery<{ reorder: Array<{ ingredient_id: number; name: string; unit: string; on_hand: number; min_level: number }> }>(['ingredients'], '/ingredients', { refetchInterval: 60000 });

  return (
    <div>
      <PageHeader title="Табло" subtitle="Данни в реално време от MySQL" action={<Segmented value={range} onChange={setRange} options={[{ value: 'today', label: 'Днес' }, { value: '7d', label: '7 дни' }, { value: '30d', label: '30 дни' }]} />} />
      {isLoading || !data ? (
        <div className="grid h-60 place-items-center"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Оборот" value={formatEur(data.kpi.sales_cents)} hint={`+ ${formatEur(data.kpi.tips_cents)} бакшиши`} />
            <Stat label="Поръчки" value={data.kpi.orders} hint={`${data.kpi.cancelled_orders} отказани`} />
            <Stat label="Средна сметка" value={formatEur(data.kpi.avg_check_cents)} hint={`${data.kpi.checks_paid} платени сметки`} />
            <Stat label="Активни маси" value={live.data ? live.data.tables.filter((t) => t.status !== 'available').length : data.kpi.active_tables} hint={live.data ? `от ${live.data.tables.length}` : undefined} tone="accent" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Оборот по дни" subtitle="Само записани (симулирани) плащания" />
              <div className="h-64 px-2 pb-3 pt-4">
                {data.by_day.length ? (
                  <ResponsiveContainer>
                    <AreaChart data={data.by_day} margin={{ left: 8, right: 12, top: 6 }}>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(d: string) => d.slice(5).split('-').reverse().join('.')} />
                      <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 100)} €`} />
                      <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line-strong)' }} />
                      <Area type="monotone" dataKey="sales_cents" stroke="var(--accent)" strokeWidth={2} fill="url(#g)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Empty title="Няма плащания в периода" />}
              </div>
            </Card>
            <Card>
              <CardHeader title="Най-продавани" subtitle="По брой" />
              <ul className="space-y-2.5 px-5 py-4">
                {data.top_items.length === 0 && <li className="text-[13px] text-muted">Няма данни.</li>}
                {data.top_items.map((t, i) => (
                  <li key={t.product_id ?? i}>
                    <div className="flex justify-between text-[13px]"><span className="truncate">{t.name}</span><span className="tabular text-muted">{t.quantity} бр.</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${(t.quantity / data.top_items[0].quantity) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Поръчки по час" />
              <div className="h-56 px-2 pb-3 pt-4">
                <ResponsiveContainer>
                  <BarChart data={data.by_hour} margin={{ left: 0, right: 12 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} />
                    <Tooltip content={<ChartTip money={false} />} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="orders" fill="var(--info)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardHeader title="Склад" subtitle="Под минималното ниво" action={<Link to="/admin/inventory" className="text-[12.5px] font-semibold text-accent">Склад →</Link>} />
              <ul className="space-y-2 px-5 py-4 text-[13px]">
                {(stock.data?.reorder ?? []).length === 0 && <li className="text-muted">Всички наличности са над минимума.</li>}
                {(stock.data?.reorder ?? []).slice(0, 6).map((r) => (
                  <li key={r.ingredient_id} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" /><span className="flex-1 truncate">{r.name}</span><Badge tone="warn">{r.on_hand} {({ g: "г", ml: "мл", pcs: "бр." } as Record<string, string>)[r.unit] ?? r.unit}</Badge></li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
                Средно време за приготвяне: <b className="text-fg">{data.avg_prep_seconds ? `${Math.round(data.avg_prep_seconds / 60)} мин` : '—'}</b>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
