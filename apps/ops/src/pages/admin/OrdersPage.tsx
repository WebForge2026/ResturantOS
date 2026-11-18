import { useState } from 'react';
import { formatEur, type StaffOrder } from '@/lib/api';
import { useBranchQuery } from '@/lib/queries';
import { ITEM_STATUS, ORDER_STATUS, clock } from '@/lib/format';
import { Badge, Card, Empty, Input, Segmented, Spinner } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

export function OrdersPage() {
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const q = filter === 'active' ? '/orders?active=1' : `/orders?date=${date}`;
  const { data, isLoading } = useBranchQuery<{ data: StaffOrder[] }>(['orders', filter, date], q, { refetchInterval: 15000 });
  return (
    <div>
      <PageHeader title="Поръчки" subtitle="История на поръчките, запазена в MySQL" action={
        <div className="flex items-center gap-2">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Активни' }, { value: 'all', label: 'По дата' }]} />
          {filter === 'all' && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />}
        </div>
      } />
      {isLoading || !data ? <div className="grid h-40 place-items-center"><Spinner /></div> : data.data.length === 0 ? <Card><Empty title="Няма поръчки" /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.data.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><b className="tabular">№ {o.number}</b><span className="text-[13px] text-muted">{o.table_label}</span></div>
                <Badge tone={ORDER_STATUS[o.status]?.tone}>{ORDER_STATUS[o.status]?.label}</Badge>
              </div>
              <div className="mt-1 text-[12px] text-subtle">{o.source === 'qr' ? 'QR' : 'Персонал'} · {clock(o.created_at)}</div>
              <ul className="mt-3 space-y-1 text-[13px]">
                {o.items.map((i) => <li key={i.id} className="flex items-center gap-2"><span className="tabular w-6 font-semibold">{i.quantity}×</span><span className="flex-1 truncate">{i.name}</span><Badge tone={ITEM_STATUS[i.status]?.tone}>{ITEM_STATUS[i.status]?.label}</Badge></li>)}
              </ul>
              <div className="mt-3 flex justify-between border-t border-line pt-2 text-[13px]"><span className="text-muted">Сума</span><b className="tabular">{formatEur(o.subtotal_cents)}</b></div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
