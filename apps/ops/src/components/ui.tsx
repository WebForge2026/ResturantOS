import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Loader2, Moon, Sun, X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cx, type Tone } from '@/lib/format';

// ------------------------------------------------------------------ Button

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        size === 'xl' && 'h-14 px-6 text-base',
        variant === 'primary' && 'bg-accent text-accent-fg shadow-[0_6px_20px_-8px_var(--accent)] hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
        variant === 'danger' && 'border border-danger/30 bg-danger-soft text-danger hover:bg-danger hover:text-white',
        variant === 'ok' && 'bg-ok text-white shadow-[0_6px_20px_-8px_var(--ok)] hover:brightness-110',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Surfaces

export const Card = ({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('rounded-2xl border border-line bg-surface', className)} {...rest}>
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={cx('flex items-start justify-between gap-3 px-5 pt-5', className)}>
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
  danger: 'bg-danger-soft text-danger',
};

export const Badge = ({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) => (
  <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', toneCls[tone], className)}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    {children}
  </span>
);

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-muted', className)} />;

export const Empty = ({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
    <div className="text-[15px] font-semibold">{title}</div>
    {text && <p className="mt-1 max-w-sm text-[13px] text-muted">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Stat = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) => (
  <Card className="p-5">
    <div className="text-[12.5px] font-medium text-muted">{label}</div>
    <div className={cx('tabular mt-2 text-[26px] font-semibold tracking-tight', tone === 'accent' && 'text-accent')}>{value}</div>
    {hint && <div className="mt-1 text-[12px] text-subtle">{hint}</div>}
  </Card>
);

// ------------------------------------------------------------------ Forms

export const Field = ({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) => (
  <label className={cx('block', className)}>
    <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</span>
    {children}
    {hint && !error && <span className="mt-1 block text-[11.5px] text-subtle">{hint}</span>}
    {error && <span className="mt-1 block text-[11.5px] text-danger">{error}</span>}
  </label>
);

const inputCls =
  'w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-fg placeholder:text-subtle transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'py-2.5', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputCls, 'h-10 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export const Toggle = ({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-surface-3')}
  >
    <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
  </button>
);

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-xl border border-line bg-surface-2 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors', value === o.value ? 'text-fg' : 'text-muted hover:text-fg')}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-surface-3 shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Dialog / Sheet

export function Dialog({ open, onClose, title, subtitle, children, footer, size = 'md', side = 'center' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: 'center' | 'right';
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <AnimatePresence>
      {open && (
        <div className={cx('fixed inset-0 z-50 flex', side === 'right' ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4')}>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cx(
              'relative flex max-h-[92dvh] w-full flex-col border border-line bg-surface shadow-2xl',
              side === 'right' ? 'h-dvh max-h-dvh max-w-xl rounded-l-3xl' : cx(w, 'rounded-t-3xl sm:rounded-3xl'),
            )}
            initial={side === 'right' ? { x: '100%' } : { y: 40, opacity: 0, scale: 0.98 }}
            animate={side === 'right' ? { x: 0 } : { y: 0, opacity: 1, scale: 1 }}
            exit={side === 'right' ? { x: '100%' } : { y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
                {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
              </div>
              <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" aria-label="Затвори">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ Toasts

type Toast = { id: number; tone: 'ok' | 'error' | 'info'; text: string };
export const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.tone === 'error' ? 6000 : 3200);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
export const toast = {
  ok: (text: string) => useToasts.getState().push({ tone: 'ok', text }),
  error: (e: unknown) => useToasts.getState().push({ tone: 'error', text: e instanceof Error ? e.message : String(e) }),
  info: (text: string) => useToasts.getState().push({ tone: 'info', text }),
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  const drop = useToasts((s) => s.drop);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            onClick={() => drop(t.id)}
            className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl border border-line bg-surface-2/95 px-4 py-3 text-left text-[13.5px] shadow-xl backdrop-blur"
          >
            {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />}
            <span>{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ Theme

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('noar.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={cx('grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg', className)} aria-label="Смени темата">
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Ticking clock for order ages. */
export const useNow = (ms = 15000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};
