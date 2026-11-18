import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { formatEur, http } from '@/lib/api';
import { AppBar } from '@/components/AppBar';
import { Badge, Button, Card, Spinner, Toggle, toast } from '@/components/ui';

type Org = {
  id: number; name: string; slug: string; status: 'active' | 'suspended'; feature_flags: Record<string, boolean>; members: number; created_at: string;
  branches: Array<{ id: number; name: string; city: string | null; onboarded: boolean; sales_30d_cents: number }>;
};
const FLAG_LABEL: Record<string, string> = { qr_ordering: 'QR поръчки', inventory: 'Склад', split_checks: 'Разделяне на сметки', advanced_reports: 'Разширени отчети', marketing: 'Маркетинг' };

export function PlatformPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['platform'], queryFn: () => http<{ flags: string[]; data: Org[] }>('/platform/organizations') });
  const audit = useQuery({ queryKey: ['platform-audit'], queryFn: () => http<{ data: Array<{ id: number; action: string; user: string | null; actor: string; organization_id: number | null; created_at: string }> }>('/platform/audit') });
  const patch = async (id: number, body: Record<string, unknown>) => {
    try {
      await http(`/platform/organizations/${id}`, { method: 'PATCH', body });
      toast.ok('Запазено');
      void qc.invalidateQueries({ queryKey: ['platform'] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="min-h-dvh">
      <AppBar title="Платформа" />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Организации</h1>
          <p className="mt-1 text-[13.5px] text-muted">Активиране, спиране и функции. Абонаментното таксуване е точка за разширение — не е реализирано.</p>
        </div>
        {isLoading || !data ? <div className="grid h-40 place-items-center"><Spinner /></div> : data.data.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2"><Building2 className="h-5 w-5 text-muted" /></div>
                <div><div className="text-[16px] font-semibold">{o.name}</div><div className="text-[12.5px] text-muted">{o.members} потребители · {o.branches.length} обекта · {o.slug}</div></div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={o.status === 'active' ? 'ok' : 'danger'} dot>{o.status === 'active' ? 'Активна' : 'Спряна'}</Badge>
                <Button size="sm" variant={o.status === 'active' ? 'danger' : 'ok'} onClick={() => patch(o.id, { status: o.status === 'active' ? 'suspended' : 'active' })}>{o.status === 'active' ? 'Спри' : 'Активирай'}</Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                {o.branches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-[13px]"><span>{b.name} <span className="text-muted">{b.city}</span></span><span className="flex items-center gap-2">{!b.onboarded && <Badge tone="warn">Настройка</Badge>}<span className="tabular text-muted">{formatEur(b.sales_30d_cents)} / 30 д.</span></span></div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {data.flags.map((f) => (
                  <div key={f} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px]">{FLAG_LABEL[f] ?? f}<Toggle checked={o.feature_flags[f] ?? true} onChange={(v) => patch(o.id, { feature_flags: { ...o.feature_flags, [f]: v } })} label={f} /></div>
                ))}
              </div>
            </div>
          </Card>
        ))}
        <Card className="overflow-x-auto">
          <div className="px-5 pt-5 text-[15px] font-semibold">Глобален одит</div>
          <table className="mt-3 w-full text-[13px]">
            <tbody className="divide-y divide-line">
              {(audit.data?.data ?? []).slice(0, 40).map((a) => <tr key={a.id}><td className="px-5 py-2 text-muted">{new Date(a.created_at).toLocaleString('bg-BG')}</td><td className="px-3 py-2">{a.action}</td><td className="px-3 py-2 text-muted">org #{a.organization_id ?? '—'}</td><td className="px-3 py-2">{a.user ?? a.actor}</td></tr>)}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
