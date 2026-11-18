import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { Badge, Button, Card, Dialog, Field, Input, Select, Spinner, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

type StaffData = {
  roles: Array<{ key: string; label: string; permissions: string[] }>;
  data: Array<{ membership_id: number; user_id: number; name: string; email: string; role: string; role_label: string; scope: string; is_active: boolean; has_pin: boolean; last_login_at: string | null }>;
};

export function StaffList({ compact }: { compact?: boolean }) {
  const { data, isLoading } = useBranchQuery<StaffData>(['staff'], '/staff');
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const branchId = useAuth((s) => s.branchId);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'waiter', password: '', pin: '' });
  const [created, setCreated] = useState<{ email: string; temp: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['b', branchId, 'staff'] });

  if (isLoading || !data) return <div className="grid h-40 place-items-center"><Spinner /></div>;

  const add = async () => {
    setBusy(true);
    try {
      const r = await mutate<{ temporary_password: string | null }>('/staff', 'POST', { ...form, password: form.password || null, pin: form.pin || null });
      setCreated({ email: form.email, temp: r.temporary_password });
      setForm({ name: '', email: '', role: 'waiter', password: '', pin: '' });
      setAdding(false);
      void refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const patch = async (id: number, body: Record<string, unknown>, ok: string) => {
    try {
      await mutate(`/staff/${id}`, 'PATCH', body);
      toast.ok(ok);
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Служител</Button></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="border-b border-line text-left text-[12px] text-muted"><tr><th className="px-4 py-3 font-medium">Служител</th><th className="px-3 py-3 font-medium">Роля</th>{!compact && <th className="px-3 py-3 font-medium">Последен вход</th>}<th className="px-3 py-3 font-medium">Статус</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {data.data.map((m) => (
              <tr key={m.membership_id}>
                <td className="px-4 py-3"><div className="font-semibold">{m.name}</div><div className="text-[12px] text-muted">{m.email}</div></td>
                <td className="px-3 py-3">
                  <Select value={m.role} disabled={m.user_id === me?.id} onChange={(e) => patch(m.membership_id, { role: e.target.value }, 'Ролята е променена')} className="h-9 w-44">
                    {data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </Select>
                </td>
                {!compact && <td className="px-3 py-3 text-[12.5px] text-muted">{m.last_login_at ? new Date(m.last_login_at).toLocaleString('bg-BG') : '—'}</td>}
                <td className="px-3 py-3"><div className="flex gap-1">{m.is_active ? <Badge tone="ok">Активен</Badge> : <Badge>Деактивиран</Badge>}{m.has_pin && <Badge tone="info">ПИН</Badge>}</div></td>
                <td className="px-3 py-3 text-right">
                  {m.user_id !== me?.id && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => { const pin = prompt('Нов ПИН (4–8 цифри) за бързо превключване на устройство:'); if (pin) void patch(m.membership_id, { pin }, 'ПИН кодът е зададен'); }}>ПИН</Button>
                      <Button size="sm" variant="ghost" icon={m.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />} onClick={() => patch(m.membership_id, { is_active: !m.is_active }, m.is_active ? 'Деактивиран' : 'Активиран')}>{m.is_active ? 'Спри' : 'Активирай'}</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Нов служител" size="md" footer={<Button variant="primary" className="w-full" loading={busy} disabled={!form.name || !form.email} onClick={add}>Създай</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Име"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Имейл"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Роля" className="sm:col-span-2">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</Select>
          </Field>
          <Field label="Парола (по избор)" hint="Ако е празно — генерира се временна парола, показва се еднократно"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="ПИН (по избор)" hint="4–8 цифри, за доверени устройства"><Input inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></Field>
          <div className="rounded-xl bg-surface-2 p-3 text-[12px] text-muted sm:col-span-2">Права на ролята: {data.roles.find((r) => r.key === form.role)?.permissions.join(', ')}</div>
        </div>
      </Dialog>
      <Dialog open={!!created} onClose={() => setCreated(null)} title="Служителят е създаден" size="sm" footer={<Button className="w-full" onClick={() => setCreated(null)}>Готово</Button>}>
        <p className="text-[13.5px]">Профил: <b>{created?.email}</b></p>
        {created?.temp ? (
          <div className="mt-3 rounded-xl border border-warn/40 bg-warn-soft p-3 text-[13px]">Временна парола (показва се само веднъж): <code className="font-mono text-[14px] font-bold">{created.temp}</code></div>
        ) : <p className="mt-2 text-[13px] text-muted">Използвана е зададената от вас парола.</p>}
      </Dialog>
    </>
  );
}

export function StaffPage() {
  return (
    <div>
      <PageHeader title="Персонал" subtitle="Роли и права се проверяват на сървъра при всяко действие" />
      <StaffList />
    </div>
  );
}
