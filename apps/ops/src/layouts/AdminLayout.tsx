import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, LayoutGrid, QrCode, Settings, UtensilsCrossed, Users, CreditCard, ChefHat, Smartphone, GlassWater } from 'lucide-react';
import { useBranch, useCan, useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { cx } from '@/lib/format';
import { AppBar } from '@/components/AppBar';

const NAV = [
  { to: '/admin', end: true, label: 'Табло', icon: LayoutDashboard, perm: 'reports.view' },
  { to: '/admin/orders', label: 'Поръчки', icon: ClipboardList, perm: 'orders.view' },
  { to: '/admin/floor', label: 'План на залата', icon: LayoutGrid, perm: 'floor.manage' },
  { to: '/admin/menu', label: 'Меню', icon: UtensilsCrossed, perm: 'menu.manage' },
  { to: '/admin/inventory', label: 'Склад', icon: Boxes, perm: 'inventory.view' },
  { to: '/admin/staff', label: 'Персонал', icon: Users, perm: 'staff.manage' },
  { to: '/admin/qr', label: 'QR кодове', icon: QrCode, perm: 'qr.manage' },
  { to: '/admin/reports', label: 'Отчети и одит', icon: BarChart3, perm: 'reports.view' },
  { to: '/admin/settings', label: 'Настройки', icon: Settings, perm: 'settings.manage' },
];

const QUICK = [
  { to: '/pos', label: 'POS', icon: CreditCard, perm: 'orders.view' },
  { to: '/kitchen', label: 'Кухня', icon: ChefHat, perm: 'kds.kitchen' },
  { to: '/bar', label: 'Бар', icon: GlassWater, perm: 'kds.bar' },
  { to: '/waiter', label: 'Сервитьор', icon: Smartphone, perm: 'orders.view' },
];

export function AdminLayout() {
  const can = useCan();
  const branch = useBranch();
  const me = useAuth((s) => s.me);
  const setBranch = useAuth((s) => s.setBranch);
  const connected = useRealtime();
  const items = NAV.filter((n) => can(n.perm));

  return (
    <div className="min-h-dvh">
      <AppBar title="Администрация" connected={connected} />
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col border-r border-line p-3 md:flex">
          {me && me.branches.length > 1 && (
            <select value={branch?.id} onChange={(e) => setBranch(Number(e.target.value))} className="mb-3 h-10 rounded-xl border border-line bg-surface-2 px-3 text-[13px]">
              {me.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <nav className="space-y-0.5">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors', isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                <n.icon className="h-4 w-4" /> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">Работни екрани</div>
          <nav className="mt-2 space-y-0.5">
            {QUICK.filter((q) => can(q.perm)).map((q) => (
              <NavLink key={q.to} to={q.to} className="flex h-9 items-center gap-3 rounded-xl px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg">
                <q.icon className="h-4 w-4" /> {q.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto rounded-xl bg-surface-2 p-3 text-[11.5px] leading-relaxed text-subtle">Локална демонстрация. Плащанията са симулирани; няма фискална интеграция.</div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>
      <nav className="no-scrollbar fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex h-16 min-w-[76px] flex-1 flex-col items-center justify-center gap-1 px-2 text-[10.5px] font-semibold', isActive ? 'text-accent' : 'text-muted')}>
            <n.icon className="h-5 w-5" />
            <span className="whitespace-nowrap">{n.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">{title}</h1>
      {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);
