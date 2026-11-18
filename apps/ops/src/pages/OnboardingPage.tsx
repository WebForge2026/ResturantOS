import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { http, mutate, type Me, type MenuData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranchInfo, useMenu, useBranchQuery } from '@/lib/queries';
import { cx } from '@/lib/format';
import { AppBar } from '@/components/AppBar';
import { FloorEditor } from '@/components/FloorEditor';
import { Badge, Button, Card, Select, Spinner, toast } from '@/components/ui';
import { IdentityForm, OperationsSettings } from './admin/SettingsPage';
import { MenuPage } from './admin/MenuPage';
import { StaffList } from './admin/StaffPage';
import { QrCodes } from './admin/QrPage';

const STEPS = [
  { key: 'identity', title: 'Обект', text: 'Име, контакти, адрес и работно време.' },
  { key: 'floor', title: 'План на залата', text: 'Зони и маси — плъзгайте и подреждайте.' },
  { key: 'menu', title: 'Меню', text: 'Категории, продукти, варианти и алергени.' },
  { key: 'routing', title: 'Кухня и бар', text: 'Към коя станция отива всеки продукт.' },
  { key: 'staff', title: 'Персонал', text: 'Служители, роли и ПИН кодове.' },
  { key: 'inventory', title: 'Склад', text: 'Съставки и рецепти (може и по-късно).' },
  { key: 'qr', title: 'QR кодове', text: 'Печат на кодовете за масите.' },
  { key: 'test_order', title: 'Тестова поръчка', text: 'Проверете целия поток от край до край.' },
] as const;

/** Guided, resumable first-login onboarding (progress stored on the branch in MySQL). */
export function OnboardingPage() {
  const { data } = useBranchInfo();
  const qc = useQueryClient();
  const nav = useNavigate();
  const branchId = useAuth((s) => s.branchId);
  const setMe = useAuth((s) => s.setMe);
  const [idx, setIdx] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!data || restored) return;
    const cur = STEPS.findIndex((s) => s.key === data.branch.onboarding?.current);
    if (cur >= 0) setIdx(cur);
    setRestored(true);
  }, [data, restored]);

  if (!data) return <div className="grid h-dvh place-items-center"><Spinner /></div>;
  const done = new Set(data.branch.onboarding?.completed_steps ?? []);
  const step = STEPS[idx];

  const go = async (next: number, complete = true) => {
    try {
      await mutate('/onboarding', 'PATCH', { completed_step: complete ? step.key : null, current: STEPS[next]?.key ?? step.key });
      void qc.invalidateQueries({ queryKey: ['b', branchId, 'info'] });
      setIdx(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(e);
    }
  };
  const finish = async () => {
    try {
      await mutate('/onboarding', 'PATCH', { completed_step: 'test_order', finish: true });
      const me = await http<{ user: Me }>('/auth/me');
      setMe(me.user);
      toast.ok('Настройката е завършена. Добре дошли!');
      nav('/admin', { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="min-h-dvh">
      <AppBar title="Първоначална настройка" />
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <div className="mb-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-subtle">Стъпка {idx + 1} от {STEPS.length}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(done.size / STEPS.length) * 100}%` }} /></div>
          </div>
          <ol className="no-scrollbar flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.key} className="shrink-0">
                <button onClick={() => setIdx(i)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', i === idx ? 'bg-surface-3' : 'hover:bg-surface-2')}>
                  <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold', done.has(s.key) ? 'border-ok bg-ok text-white' : i === idx ? 'border-accent text-accent' : 'border-line text-muted')}>{done.has(s.key) ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                  <span className="hidden min-w-0 lg:block"><span className="block text-[13.5px] font-semibold">{s.title}</span><span className="block truncate text-[12px] text-muted">{s.text}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <main className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={step.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <h1 className="text-[24px] font-semibold tracking-tight">{step.title}</h1>
              <p className="mb-5 mt-1 text-[14px] text-muted">{step.text}</p>
              {step.key === 'identity' && (
                <div className="space-y-4">
                  <Card className="p-5"><IdentityForm info={data} onSaved={() => go(idx + 1)} /></Card>
                  <Card className="px-5 py-2"><OperationsSettings info={data} /></Card>
                </div>
              )}
              {step.key === 'floor' && <FloorEditor />}
              {step.key === 'menu' && <MenuPage />}
              {step.key === 'routing' && <Routing />}
              {step.key === 'staff' && <StaffList compact />}
              {step.key === 'inventory' && (
                <Card className="p-6 text-[14px] leading-relaxed">
                  <p>Складът е по избор и може да се настрои по-късно. За всеки продукт с рецепта съставките се <b>резервират</b> при приемане на поръчката и се <b>изписват</b>, когато кухнята маркира ястието „Готово“. Продукти без рецепта не генерират складови движения.</p>
                  <div className="mt-4 flex gap-2"><Button onClick={() => window.open('/admin/inventory', '_blank')} icon={<ExternalLink className="h-4 w-4" />}>Отвори склада</Button></div>
                </Card>
              )}
              {step.key === 'qr' && <QrCodes />}
              {step.key === 'test_order' && <TestOrder />}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" disabled={idx === 0} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setIdx(idx - 1)}>Назад</Button>
            <div className="flex gap-2">
              {idx < STEPS.length - 1 && <Button variant="ghost" onClick={() => go(idx + 1, false)}>Пропусни</Button>}
              {idx < STEPS.length - 1 ? (
                <Button variant="primary" onClick={() => go(idx + 1)}>Готово, напред <ChevronRight className="h-4 w-4" /></Button>
              ) : (
                <Button variant="primary" onClick={finish} icon={<Check className="h-4 w-4" />}>Завърши настройката</Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Routing() {
  const { data } = useMenu();
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  if (!data) return <Spinner />;
  const setStation = async (p: MenuData['products'][number], stationId: number) => {
    try {
      await mutate(`/products/${p.id}`, 'PUT', {
        name: p.name, category_id: p.category_id, station_id: stationId, price_cents: p.price_cents, description: p.description, ingredients: p.ingredients, allergens: p.allergens,
        portion: p.portion, image_url: p.image_url, art: p.art, is_available: p.is_available, is_published: p.is_published, vat_rate_bps: p.vat_rate_bps,
      });
      toast.ok(`„${p.name}“ → ${data.stations.find((s) => s.id === stationId)?.name}`);
      void qc.invalidateQueries({ queryKey: ['b', branchId, 'menu'] });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="divide-y divide-line">
        {data.products.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
            <span className="flex-1 truncate">{p.name}</span>
            <Select value={p.station_id ?? ''} onChange={(e) => setStation(p, Number(e.target.value))} className="h-9 w-48">{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </div>
        ))}
      </Card>
      <Card className="h-fit p-4 text-[13px]">
        <div className="mb-2 font-semibold">Станции</div>
        {data.stations.map((s) => <div key={s.id} className="flex items-center gap-2 py-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}<Badge className="ml-auto">{s.display === 'bar' ? 'Бар' : 'Кухня'}</Badge></div>)}
        <p className="mt-3 text-muted">Продуктите на „Бар“ се показват само на бар дисплея; останалите — на кухненския, филтрирани по станция.</p>
      </Card>
    </div>
  );
}

function TestOrder() {
  const { data } = useBranchQuery<{ data: Array<{ id: number; number: number; label: string; qr_token: string }> }>(['qr'], '/qr-codes');
  const base = (() => {
    try {
      return localStorage.getItem('noar.qrBase') ?? `${window.location.protocol}//${window.location.hostname}:3000`;
    } catch {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
  })();
  const t = data?.data[0];
  return (
    <Card className="p-6">
      <ol className="space-y-4 text-[14px] leading-relaxed">
        <li><b>1.</b> Отворете QR менюто за {t?.label ?? 'първата маса'} и изпратете поръчка. {t && <a className="ml-1 font-semibold text-accent" href={`${base}/?t=${encodeURIComponent(t.qr_token)}`} target="_blank" rel="noreferrer">Отвори QR менюто ↗</a>}</li>
        <li><b>2.</b> Вижте поръчката в <a className="font-semibold text-accent" href="/pos" target="_blank">POS ↗</a> — масата се оцветява без опресняване.</li>
        <li><b>3.</b> Маркирайте артикулите като „Готово“ в <a className="font-semibold text-accent" href="/kitchen" target="_blank">Кухня ↗</a> и <a className="font-semibold text-accent" href="/bar" target="_blank">Бар ↗</a>.</li>
        <li><b>4.</b> Сервирайте от <a className="font-semibold text-accent" href="/waiter" target="_blank">сервитьорския портал ↗</a>.</li>
        <li><b>5.</b> В POS направете симулирано плащане и освободете масата.</li>
      </ol>
      {!t && <p className="mt-4 text-[13px] text-warn">Първо добавете маси в плана на залата.</p>}
    </Card>
  );
}
