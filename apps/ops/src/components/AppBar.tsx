import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChefHat, CreditCard, GlassWater, LayoutDashboard, LogOut, ShieldCheck, Smartphone, Grid3x3 } from 'lucide-react';
import { http } from '@/lib/api';
import { useAuth, useBranch } from '@/lib/auth';
import { disconnectRealtime } from '@/lib/realtime';
import { cx } from '@/lib/format';
import { ThemeToggle } from './ui';
import { Logo } from '@/pages/LoginPage';

export const MODULES = [
  { to: '/pos', label: 'POS', perm: 'orders.view', icon: CreditCard },
  { to: '/waiter', label: 'Сервитьор', perm: 'orders.view', icon: Smartphone },
  { to: '/kitchen', label: 'Кухня', perm: 'kds.kitchen', icon: ChefHat },
  { to: '/bar', label: 'Бар', perm: 'kds.bar', icon: GlassWater },
  { to: '/admin', label: 'Админ', perm: 'branch.view', icon: LayoutDashboard },
];

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', connected ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')} title={connected ? 'Връзка в реално време' : 'Резервно опресняване на всеки няколко секунди'}>
      <span className={cx('h-1.5 w-1.5 rounded-full bg-current', connected && 'pulse-ring')} />
      {connected ? 'На живо' : 'Опресняване'}
    </span>
  );
}

export function useLogout() {
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  return async () => {
    try {
      await http('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    disconnectRealtime();
    logout();
    nav('/login', { replace: true });
  };
}

export function AppBar({ title, connected, children }: { title: string; connected?: boolean; children?: ReactNode }) {
  const me = useAuth((s) => s.me);
  const branch = useBranch();
  const [open, setOpen] = useState(false);
  const logout = useLogout();
  const modules = MODULES.filter((m) => branch?.permissions.includes(m.perm));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
        <Logo className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-tight">{title}</span>
            {connected !== undefined && <LiveDot connected={connected} />}
          </div>
          <div className="truncate text-[11.5px] text-muted">{branch?.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {children}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Модули">
            {modules.map((m) => (
              <NavLink key={m.to} to={m.to} className={({ isActive }) => cx('flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors', isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
                <m.icon className="h-4 w-4" />
                {m.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
          <div className="relative">
            <button onClick={() => setOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Меню">
              <Grid3x3 className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {open && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
                    <div className="px-3 py-2">
                      <div className="text-[13px] font-semibold">{me?.name}</div>
                      <div className="text-[12px] text-muted">{branch?.role_label}</div>
                    </div>
                    <div className="my-1 h-px bg-line" />
                    {modules.map((m) => (
                      <NavLink key={m.to} to={m.to} onClick={() => setOpen(false)} className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[13.5px] hover:bg-surface-2">
                        <m.icon className="h-4 w-4 text-muted" /> {m.label}
                      </NavLink>
                    ))}
                    {me?.is_platform_admin && (
                      <NavLink to="/platform" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[13.5px] hover:bg-surface-2">
                        <ShieldCheck className="h-4 w-4 text-muted" /> Платформа
                      </NavLink>
                    )}
                    <div className="my-1 h-px bg-line" />
                    <button onClick={logout} className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13.5px] text-danger hover:bg-danger-soft">
                      <LogOut className="h-4 w-4" /> Изход
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
