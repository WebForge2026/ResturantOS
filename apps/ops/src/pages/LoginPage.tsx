import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ChefHat, CreditCard, GlassWater, LayoutDashboard, Package, ShieldCheck, Smartphone, Crown } from 'lucide-react';
import { http, type Me } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { Button, Field, Input, ThemeToggle } from '@/components/ui';

const DEMO = import.meta.env.DEV
  ? [
      { email: 'owner@noar.local', role: 'Собственик', icon: Crown },
      { email: 'manager@noar.local', role: 'Мениджър', icon: LayoutDashboard },
      { email: 'cashier@noar.local', role: 'Каса / POS', icon: CreditCard },
      { email: 'waiter@noar.local', role: 'Сервитьор', icon: Smartphone },
      { email: 'kitchen@noar.local', role: 'Кухня', icon: ChefHat },
      { email: 'bar@noar.local', role: 'Бар', icon: GlassWater },
      { email: 'stock@noar.local', role: 'Склад', icon: Package },
      { email: 'admin@platform.local', role: 'Платформа', icon: ShieldCheck },
    ]
  : [];

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const expired = useAuth((s) => s.expired);
  const nav = useNavigate();

  const submit = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await http<{ token: string; user: Me }>('/auth/login', { method: 'POST', body: { email: override ?? email, password, device: 'ops-web' } });
      setSession(res.token, res.user);
      const b = res.user.branches[0];
      nav(b && !b.onboarding_completed && b.permissions.includes('branch.manage') ? '/onboarding' : homeFor(b?.role, res.user.is_platform_admin), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="relative hidden overflow-hidden bg-[#6b4429] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_30%_20%,rgba(255,220,170,0.25),transparent_60%)]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-semibold tracking-wide text-white/80">RestaurantOS</span>
          </div>
          <div>
            <h1 className="max-w-md text-[44px] font-semibold leading-[1.05] tracking-tight">
              Една система за <span className="text-[#f2c98f]">залата, кухнята</span> и бара.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">
              QR поръчки, POS, кухненски и бар дисплеи, сервитьорски портал, склад и отчети — свързани в реално време.
            </p>
          </div>
          <p className="text-xs text-white/40">Локална демонстрация · плащанията са симулирани · не е фискално устройство</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo />
            <span className="font-semibold">NOAR RestaurantOS</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Вход за персонала</h2>
          <p className="mt-1 text-sm text-muted">Влезте с имейл и парола.</p>
          {expired && <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">Сесията изтече. Моля, влезте отново.</p>}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Имейл">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@restaurant.bg" />
            </Field>
            <Field label="Парола">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Вход
            </Button>
          </form>

          <p className="mt-4 text-center text-[13px] text-muted">
            Нов ресторант?{' '}
            <Link to="/register" className="font-semibold text-accent">
              Създайте профил
            </Link>
          </p>

          {DEMO.length > 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-line p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-subtle">Демо профили (само локално)</div>
              <p className="mt-1 text-[12px] text-muted">Паролата е в backend/.env → NOAR_DEMO_PASSWORD. Изберете роля, въведете паролата и натиснете „Вход“.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => setEmail(d.email)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12.5px] transition-colors ${email === d.email ? 'border-accent/50 bg-accent-soft' : 'border-line hover:border-line-strong'}`}
                  >
                    <d.icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate font-medium">{d.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export const Logo = ({ className = 'h-9 w-9' }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="9" fill="#6b4429" />
    <circle cx="16" cy="16" r="8.5" fill="none" stroke="#f5f1ea" strokeWidth="2" />
    <circle cx="16" cy="16" r="2.6" fill="#d9a865" />
    <path d="M16 3v4" stroke="#d9a865" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
