import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { http, type Me, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input } from '@/components/ui';
import { Logo } from './LoginPage';

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', organization_name: '', branch_name: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const nav = useNavigate();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      const res = await http<{ token: string; user: Me }>('/auth/register', { method: 'POST', body: form });
      setSession(res.token, res.user);
      nav('/onboarding', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.details ?? {});
        setError(err.message);
      } else setError('Грешка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <span className="font-semibold">NOAR RestaurantOS</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Създайте своя ресторант</h1>
        <p className="mt-1 text-sm text-muted">След регистрация ще ви преведем стъпка по стъпка през настройката.</p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <Field label="Вашето име" error={errors.name?.[0]}><Input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Имейл" error={errors.email?.[0]}><Input type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Парола" hint="Минимум 10 символа" error={errors.password?.[0]}><Input type="password" value={form.password} onChange={set('password')} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Фирма / организация" error={errors.organization_name?.[0]}><Input value={form.organization_name} onChange={set('organization_name')} required /></Field>
            <Field label="Име на обекта" error={errors.branch_name?.[0]}><Input value={form.branch_name} onChange={set('branch_name')} required /></Field>
          </div>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button variant="primary" size="lg" loading={loading} type="submit">Създай профил</Button>
          <p className="text-[12px] text-subtle">Локално: потвърждението на имейла се записва в лог файла (MAIL_MAILER=log). В продукция достъпът трябва да изисква потвърден имейл.</p>
        </form>
        <p className="mt-6 text-center text-[13px] text-muted">
          Имате профил? <Link to="/login" className="font-semibold text-accent">Вход</Link>
        </p>
      </div>
    </div>
  );
}
