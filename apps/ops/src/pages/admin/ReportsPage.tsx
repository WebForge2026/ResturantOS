import { useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEur } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { Badge, Button, Card, CardHeader, Field, Input, Segmented, Spinner, Stat, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';
import { ChartTip, rangeFor, type Summary } from './DashboardPage';

type Audit = { id: number; action: string; actor: string; user: string | null; subject_type: string | null; subject_id: number | null; meta: Record<string, unknown> | null; created_at: string };
type Shift = { id: number; status: string; opened_by: string | null; opened_at: string; closed_at: string | null; cash_sales_cents: number; card_sales_cents: number; expected_cash_cents: number; counted_cash_cents: number | null; difference_cents: number | null };

const ACTION: Record<string, string> = {
  'order.placed': 'Нова поръчка', 'order.accepted': 'Приета поръчка', 'order.served': 'Сервирано', 'order.cancelled': 'Отказана поръчка', 'order_item.cancelled': 'Отказан артикул',
  'payment.captured': 'Плащане (симул.)', 'check.discount': 'Отстъпка', 'check.split': 'Разделена сметка', 'check.merge': 'Обединени сметки', 'check_item.voided': 'Анулиран артикул',
  'session.cleared': 'Освободена маса', 'session.transfer': 'Преместена маса', 'shift.opened': 'Отворена смяна', 'shift.closed': 'Затворена смяна', 'floor.saved': 'Запазен план',
  'product.created': 'Нов продукт', 'product.updated': 'Променен продукт', 'product.availability': 'Наличност на продукт', 'settings.updated': 'Настройки', 'staff.created': 'Нов служител', 'staff.updated': 'Променен служител',
  'qr.rotated': 'Нов QR код', 'stock.waste': 'Брак', 'stock.count': 'Инвентаризация', 'stock.received': 'Доставка', 'recipe.saved': 'Рецепта', 'request.created': 'Повикване от гост',
};

export function ReportsPage() {
  const can = useCan();
  const token = useAuth((s) => s.token);
  const branchId = useAuth((s) => s.branchId);
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | 'custom'>('7d');
  const [custom, setCustom] = useState(rangeFor('7d'));
  const { from, to } = preset === 'custom' ? custom : rangeFor(preset);
  const { data } = useBranchQuery<Summary>(['summary', from, to], `/reports/summary?from=${from}&to=${to}`);
  const audit = useBranchQuery<{ data: Audit[] }>(['audit'], '/audit', { enabled: can('audit.view'), refetchInterval: 20000 });
  const shifts = useBranchQuery<{ data: Shift[] }>(['shifts'], '/shifts', { enabled: can('shifts.manage') });

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/v1/branches/${branchId}/reports/sales.csv?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Неуспешен експорт');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `noar-sales-${from}-${to}.csv`;
      a.click();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Отчети и одит" subtitle="Изчислено от записаните поръчки и плащания" action={<Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Експорт CSV</Button>} />
      <div className="flex flex-wrap items-end gap-3">
        <Segmented value={preset} onChange={setPreset} options={[{ value: 'today', label: 'Днес' }, { value: '7d', label: '7 дни' }, { value: '30d', label: '30 дни' }, { value: 'custom', label: 'Период' }]} />
        {preset === 'custom' && (
          <>
            <Field label="От"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
            <Field label="До"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
          </>
        )}
      </div>
      {!data ? <div className="grid h-40 place-items-center"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Оборот" value={formatEur(data.kpi.sales_cents)} />
            <Stat label="Платени сметки" value={data.kpi.checks_paid} />
            <Stat label="Продадени артикули" value={data.kpi.items_sold} />
            <Stat label="Отстъпки" value={formatEur(data.kpi.discounts_cents)} />
            <Stat label="Анулирани артикули" value={data.kpi.voided_items} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="По начин на плащане" subtitle="Симулирани плащания" />
              <div className="space-y-2 p-5">
                {data.payments_by_method.map((p) => (
                  <div key={p.method} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-[14px]"><span>{p.method === 'cash' ? 'В брой' : 'Карта'} <span className="text-muted">· {p.count} бр.</span></span><b className="tabular">{formatEur(p.amount_cents)}</b></div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Оборот по продукт" />
              <div className="h-64 p-3">
                <ResponsiveContainer>
                  <BarChart data={data.top_items} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} stroke="var(--line)" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 100)}€`} />
                    <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="revenue_cents" fill="var(--accent)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {can('shifts.manage') && shifts.data && (
        <Card className="overflow-x-auto">
          <CardHeader title="Касови смени" subtitle="Равнение на пари в брой" />
          <table className="mt-3 w-full min-w-[640px] text-[13px]">
            <thead className="border-y border-line text-left text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">Отворена</th><th className="px-3 py-2.5 font-medium">От</th><th className="px-3 py-2.5 text-right font-medium">В брой</th><th className="px-3 py-2.5 text-right font-medium">Карта</th><th className="px-3 py-2.5 text-right font-medium">Очаквано</th><th className="px-3 py-2.5 text-right font-medium">Разлика</th></tr></thead>
            <tbody className="divide-y divide-line">
              {shifts.data.data.map((s) => (
                <tr key={s.id}><td className="px-5 py-2.5">{new Date(s.opened_at).toLocaleString('bg-BG')}</td><td className="px-3 py-2.5 text-muted">{s.opened_by}</td><td className="tabular px-3 py-2.5 text-right">{formatEur(s.cash_sales_cents)}</td><td className="tabular px-3 py-2.5 text-right">{formatEur(s.card_sales_cents)}</td><td className="tabular px-3 py-2.5 text-right">{formatEur(s.expected_cash_cents)}</td><td className="px-3 py-2.5 text-right">{s.status === 'open' ? <Badge tone="info">Отворена</Badge> : s.difference_cents === null ? '—' : <Badge tone={s.difference_cents === 0 ? 'ok' : 'warn'}>{formatEur(s.difference_cents)}</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {can('audit.view') && (
        <Card className="overflow-x-auto">
          <CardHeader title="Одит журнал" subtitle="Последните 300 действия" />
          <table className="mt-3 w-full min-w-[640px] text-[13px]">
            <thead className="border-y border-line text-left text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">Време</th><th className="px-3 py-2.5 font-medium">Действие</th><th className="px-3 py-2.5 font-medium">Изпълнител</th><th className="px-3 py-2.5 font-medium">Обект</th><th className="px-3 py-2.5 font-medium">Детайли</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(audit.data?.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">{new Date(a.created_at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                  <td className="px-3 py-2.5 font-medium">{ACTION[a.action] ?? a.action}</td>
                  <td className="px-3 py-2.5">{a.user ?? (a.actor === 'guest' ? 'Гост (QR)' : 'Система')}</td>
                  <td className="px-3 py-2.5 text-muted">{a.subject_type ? `${a.subject_type} #${a.subject_id}` : '—'}</td>
                  <td className="max-w-[320px] truncate px-3 py-2.5 font-mono text-[11.5px] text-subtle">{a.meta ? JSON.stringify(a.meta) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
