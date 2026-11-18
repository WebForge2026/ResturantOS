import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranchInfo, type BranchInfo } from '@/lib/queries';
import { Button, Card, CardHeader, Field, Input, Segmented, Spinner, Toggle, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

const DAYS = ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'];

export function IdentityForm({ info, onSaved }: { info: BranchInfo; onSaved?: () => void }) {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const b = info.branch;
  const [f, setF] = useState({ name: b.name, brand_name: b.brand_name ?? '', phone: b.phone ?? '', email: b.email ?? '', address: b.address ?? '', city: b.city ?? '', timezone: b.timezone });
  const [hours, setHours] = useState(b.opening_hours ?? DAYS.map((_, i) => ({ day: i + 1, open: '11:00', close: '23:00', closed: false })));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await mutate('/', 'PATCH', { ...f, email: f.email || null, opening_hours: hours });
      toast.ok('Данните на обекта са запазени');
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
      onSaved?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Име на обекта"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Търговско име (в QR менюто)"><Input value={f.brand_name} onChange={set('brand_name')} /></Field>
        <Field label="Телефон"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Имейл"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Адрес"><Input value={f.address} onChange={set('address')} /></Field>
        <Field label="Град"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="Часова зона"><Input value={f.timezone} onChange={set('timezone')} /></Field>
      </div>
      <div>
        <div className="mb-2 text-[12.5px] font-medium text-muted">Работно време</div>
        <div className="space-y-1.5">
          {hours.map((h, i) => (
            <div key={h.day} className="grid grid-cols-[110px_1fr_1fr_auto] items-center gap-2 text-[13px]">
              <span>{DAYS[h.day - 1]}</span>
              <Input type="time" value={h.open ?? ''} disabled={h.closed} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
              <Input type="time" value={h.close ?? ''} disabled={h.closed} onChange={(e) => setHours(hours.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
              <label className="flex items-center gap-2 text-[12.5px] text-muted"><Toggle checked={!h.closed} onChange={(v) => setHours(hours.map((x, j) => (j === i ? { ...x, closed: !v } : x)))} label="Отворено" /> {h.closed ? 'Почивен' : 'Отворено'}</label>
            </div>
          ))}
        </div>
      </div>
      <Button variant="primary" loading={busy} onClick={save}>Запази</Button>
    </div>
  );
}

export function OperationsSettings({ info }: { info: BranchInfo }) {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [s, setS] = useState(info.branch.settings);
  useEffect(() => setS(info.branch.settings), [info]);
  const save = async (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await mutate('/settings', 'PATCH', patch);
      toast.ok('Настройката е запазена');
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
    } catch (e) {
      setS(s);
      toast.error(e);
    }
  };
  const Row = ({ title, text, children }: { title: string; text: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div><div className="text-[14px] font-medium">{title}</div><div className="text-[12.5px] text-muted">{text}</div></div>
      {children}
    </div>
  );
  return (
    <div className="divide-y divide-line">
      <Row title="Приемане на QR поръчки" text="Автоматично — директно към кухнята. Ръчно — сервитьор потвърждава всяка поръчка.">
        <Segmented value={s.order_accept_mode} onChange={(v) => save({ order_accept_mode: v })} options={[{ value: 'auto', label: 'Автоматично' }, { value: 'manual', label: 'Ръчно' }]} />
      </Row>
      <Row title="Показвай цени и в лева" text="Информативно, по фиксирания курс 1 € = 1,95583 лв. Сметките са в евро."><Toggle checked={s.show_bgn} onChange={(v) => save({ show_bgn: v })} label="BGN" /></Row>
      <Row title="Бакшиши" text="Позволява въвеждане на бакшиш при плащане."><Toggle checked={s.tips_enabled} onChange={(v) => save({ tips_enabled: v })} label="Бакшиши" /></Row>
      <Row title="Плащания само при отворена смяна" text="Изисква отворена касова смяна преди плащане."><Toggle checked={s.require_shift_for_payments} onChange={(v) => save({ require_shift_for_payments: v })} label="Смяна" /></Row>
      <Row title="Резервиране на склад при приемане" text="Съставките по рецепта се резервират при приемане и се изписват при „Готово“."><Toggle checked={s.stock_reservation_enabled} onChange={(v) => save({ stock_reservation_enabled: v })} label="Резервиране" /></Row>
      <Row title="Такса обслужване" text="Процент върху сметката след отстъпки.">
        <div className="flex items-center gap-2"><Input className="w-20 text-right" inputMode="decimal" defaultValue={s.service_charge_bps / 100} onBlur={(e) => save({ service_charge_bps: Math.round(Number(e.target.value.replace(',', '.')) * 100) || 0 })} /> %</div>
      </Row>
    </div>
  );
}

export function SettingsPage() {
  const { data } = useBranchInfo();
  if (!data) return <div className="grid h-60 place-items-center"><Spinner /></div>;
  return (
    <div className="space-y-4">
      <PageHeader title="Настройки" subtitle={data.branch.name} />
      <Card><CardHeader title="Работни правила" /><div className="px-5 pb-2"><OperationsSettings info={data} /></div></Card>
      <Card><CardHeader title="Обект и работно време" /><div className="p-5"><IdentityForm info={data} /></div></Card>
      <Card><CardHeader title="Станции за приготвяне" subtitle="Маршрутизиране на поръчките" />
        <ul className="divide-y divide-line px-5 py-2">
          {data.stations.map((s) => <li key={s.id} className="flex items-center gap-3 py-3 text-[13.5px]"><span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{s.name}<span className="ml-auto text-muted">{s.display === 'bar' ? 'Бар дисплей' : 'Кухненски дисплей'} · {s.code}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
