import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BellRing, ChefHat, Receipt, Clock3 } from 'lucide-react';
import { formatEur, type LiveTable } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { Segmented, useNow } from './ui';

const statusStyle: Record<LiveTable['status'], string> = {
  available: 'border-line bg-surface-2 text-muted',
  occupied: 'border-info/40 bg-info-soft text-fg',
  bill: 'border-warn/60 bg-warn-soft text-fg',
  settled: 'border-ok/50 bg-ok-soft text-fg',
};

/** Live table map. Positions come from the floor-plan editor; scaled to fit the container. */
export function FloorMap({
  tables,
  areas,
  selectedId,
  onSelect,
  compact,
}: {
  tables: LiveTable[];
  areas: Array<{ id: number; name: string }>;
  selectedId?: number | null;
  onSelect: (t: LiveTable) => void;
  compact?: boolean;
}) {
  const [areaId, setAreaId] = useState<string>('all');
  const now = useNow(20000);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const visible = areaId === 'all' ? tables : tables.filter((t) => String(t.floor_area_id) === areaId);
  const useGrid = compact || width < 640 || areaId === 'all';
  const bounds = useMemo(() => {
    const maxX = Math.max(600, ...visible.map((t) => t.x + t.width + 40));
    const maxY = Math.max(300, ...visible.map((t) => t.y + t.height + 40));
    return { maxX, maxY };
  }, [visible]);
  const scale = Math.min(1.25, width / bounds.maxX);

  const counts = {
    occupied: tables.filter((t) => t.status !== 'available').length,
    ready: tables.filter((t) => t.flags.includes('ready')).length,
    bill: tables.filter((t) => t.status === 'bill').length,
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={areaId}
          onChange={setAreaId}
          options={[{ value: 'all', label: 'Всички' }, ...areas.map((a) => ({ value: String(a.id), label: a.name }))]}
        />
        <div className="flex flex-wrap gap-3 text-[12px] text-muted">
          <span><b className="tabular text-fg">{counts.occupied}</b>/{tables.length} заети</span>
          <span className="text-accent"><b className="tabular">{counts.ready}</b> с готови ястия</span>
          <span className="text-warn"><b className="tabular">{counts.bill}</b> искат сметка</span>
        </div>
      </div>

      <div ref={ref}>
        {useGrid ? (
          <div className={cx('grid gap-2.5', compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-5')}>
            {visible.map((t) => (
              <TableTile key={t.id} t={t} selected={t.id === selectedId} onClick={() => onSelect(t)} now={now} />
            ))}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-[radial-gradient(circle_at_1px_1px,var(--line)_1px,transparent_0)] [background-size:24px_24px]" style={{ height: bounds.maxY * scale }}>
            {visible.map((t) => (
              <div key={t.id} className="absolute" style={{ left: t.x * scale, top: t.y * scale, width: t.width * scale, height: t.height * scale }}>
                <TableTile t={t} selected={t.id === selectedId} onClick={() => onSelect(t)} now={now} fill />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TableTile({ t, selected, onClick, now, fill }: { t: LiveTable; selected: boolean; onClick: () => void; now: number; fill?: boolean }) {
  const ready = t.flags.includes('ready');
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cx(
        'relative flex flex-col justify-between border p-2.5 text-left transition-[border-color,box-shadow] duration-200',
        fill ? 'h-full w-full' : 'min-h-[92px]',
        t.shape === 'round' ? 'rounded-[28px]' : 'rounded-2xl',
        statusStyle[t.status],
        selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
        ready && 'shadow-[0_0_0_1px_var(--accent),0_0_24px_-6px_var(--accent)]',
      )}
      aria-label={`${t.label}, ${t.seats} места`}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="tabular text-[15px] font-bold leading-none">{String(t.number).padStart(2, '0')}</span>
        <span className="flex gap-1">
          {t.flags.includes('pending') && <BellRing className="h-3.5 w-3.5 text-warn" aria-label="Чака потвърждение" />}
          {ready && <ChefHat className="h-3.5 w-3.5 text-accent" aria-label="Готови ястия" />}
          {t.flags.includes('call') && <BellRing className="h-3.5 w-3.5 animate-pulse text-accent" aria-label="Вика сервитьор" />}
          {t.status === 'bill' && <Receipt className="h-3.5 w-3.5 text-warn" aria-label="Иска сметка" />}
        </span>
      </div>
      {t.session ? (
        <div className="mt-1 min-w-0">
          <div className="tabular truncate text-[12.5px] font-semibold">{formatEur(t.session.due_cents ?? t.session.total_cents ?? 0)}</div>
          <div className="flex items-center gap-1 truncate text-[10.5px] text-muted">
            <Clock3 className="h-3 w-3 shrink-0" />
            {timeAgo(t.session.opened_at, now)}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-subtle">{t.seats} места</div>
      )}
    </motion.button>
  );
}
