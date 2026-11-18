import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Circle, Copy, Grid2x2, Minus, Plus, Redo2, RotateCw, Save, Square, RectangleHorizontal, Trash2, Undo2, Move, Maximize } from 'lucide-react';
import { bApi, mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/format';
import { Badge, Button, Field, Input, Select, Spinner, toast } from './ui';

type Area = { id: number; name: string; kind: 'indoor' | 'terrace' | 'bar' | 'private' };
type Table = { id: number; area_id: number; number: number; label: string; seats: number; shape: 'round' | 'square' | 'rect'; x: number; y: number; width: number; height: number; rotation: number };
type Plan = { areas: Area[]; tables: Table[] };
type ServerFloor = { areas: Array<{ id: number; name: string; kind: Area['kind'] }>; tables: Array<Omit<Table, 'area_id'> & { floor_area_id: number | null; is_active: boolean }> };

const GRID = 20;
const CANVAS = { w: 1400, h: 900 };
const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
let tempId = -1;

/**
 * Interactive floor-plan editor: drag / resize / rotate tables, grid snap, zoom & pan,
 * undo/redo, keyboard moves (arrows, Shift = ×10, Delete), and a properties form as an
 * accessible alternative to pointer gestures. Saves to MySQL via PUT /floor.
 */
export function FloorEditor({ onSaved, compact }: { onSaved?: () => void; compact?: boolean }) {
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [history, setHistory] = useState<{ past: Plan[]; future: Plan[] }>({ past: [], future: [] });
  const [areaId, setAreaId] = useState<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapOn, setSnapOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const f = await bApi<ServerFloor>('/floor');
    const p: Plan = {
      areas: f.areas.map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
      tables: f.tables.filter((t) => t.is_active).map((t) => ({ ...t, area_id: t.floor_area_id ?? f.areas[0]?.id ?? -1 })),
    };
    setPlan(p);
    setAreaId((cur) => cur ?? p.areas[0]?.id ?? null);
    setHistory({ past: [], future: [] });
    setDirty(false);
  }, []);

  useEffect(() => {
    load().catch(toast.error);
  }, [load]);

  // fit zoom to viewport width
  useEffect(() => {
    if (!viewport.current) return;
    const w = viewport.current.clientWidth;
    setZoom(clamp(w / 1300, 0.35, 1));
  }, [plan === null]);

  const commit = useCallback((next: Plan) => {
    setPlan((cur) => {
      if (cur) setHistory((h) => ({ past: [...h.past.slice(-60), cur], future: [] }));
      return next;
    });
    setDirty(true);
  }, []);
  const undo = () => setHistory((h) => {
    if (!h.past.length || !plan) return h;
    const prev = h.past[h.past.length - 1];
    setPlan(prev);
    setDirty(true);
    return { past: h.past.slice(0, -1), future: [plan, ...h.future] };
  });
  const redo = () => setHistory((h) => {
    if (!h.future.length || !plan) return h;
    const [next, ...rest] = h.future;
    setPlan(next);
    setDirty(true);
    return { past: [...h.past, plan], future: rest };
  });

  const tables = useMemo(() => plan?.tables.filter((t) => t.area_id === areaId) ?? [], [plan, areaId]);
  const selected = plan?.tables.find((t) => t.id === sel) ?? null;

  const update = (id: number, patch: Partial<Table>, record = true) => {
    if (!plan) return;
    const next = { ...plan, tables: plan.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
    if (record) commit(next);
    else {
      setPlan(next);
      setDirty(true);
    }
  };

  const addTable = (shape: Table['shape']) => {
    if (!plan || areaId === null) return;
    const number = Math.max(0, ...plan.tables.map((t) => t.number)) + 1;
    const id = tempId--;
    const vw = viewport.current?.clientWidth ?? 800;
    const t: Table = {
      id, area_id: areaId, number, label: `Маса ${String(number).padStart(2, '0')}`, seats: shape === 'rect' ? 6 : 4, shape,
      x: snap(clamp((-pan.x + vw / 2) / zoom - 50, 0, CANVAS.w - 160), true), y: snap(clamp((-pan.y + 160) / zoom, 0, CANVAS.h - 120), true),
      width: shape === 'rect' ? 160 : 100, height: 100, rotation: 0,
    };
    commit({ ...plan, tables: [...plan.tables, t] });
    setSel(id);
  };

  const duplicate = () => {
    if (!plan || !selected) return;
    const number = Math.max(0, ...plan.tables.map((t) => t.number)) + 1;
    const id = tempId--;
    commit({ ...plan, tables: [...plan.tables, { ...selected, id, number, label: `Маса ${String(number).padStart(2, '0')}`, x: selected.x + 40, y: selected.y + 40 }] });
    setSel(id);
  };

  const remove = () => {
    if (!plan || !selected) return;
    commit({ ...plan, tables: plan.tables.filter((t) => t.id !== selected.id) });
    setSel(null);
  };

  const addArea = () => {
    if (!plan) return;
    const id = tempId--;
    commit({ ...plan, areas: [...plan.areas, { id, name: `Зона ${plan.areas.length + 1}`, kind: 'indoor' }] });
    setAreaId(id);
  };

  const save = async () => {
    if (!plan) return;
    const nums = plan.tables.map((t) => t.number);
    if (new Set(nums).size !== nums.length) {
      toast.error(new Error('Има повтарящи се номера на маси.'));
      return;
    }
    setSaving(true);
    try {
      await mutate('/floor', 'PUT', {
        areas: plan.areas,
        tables: plan.tables.map((t) => ({ ...t, x: Math.round(t.x), y: Math.round(t.y), width: Math.round(t.width), height: Math.round(t.height), rotation: Math.round(t.rotation) })),
      });
      toast.ok('Планът на залата е запазен');
      await load();
      void qc.invalidateQueries({ queryKey: ['b', branchId] });
      onSaved?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (!selected) return;
      const step = e.shiftKey ? GRID * 2 : snapOn ? GRID : 2;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        update(selected.id, { x: clamp(selected.x + moves[e.key][0], 0, CANVAS.w - selected.width), y: clamp(selected.y + moves[e.key][1], 0, CANVAS.h - selected.height) });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (e.key.toLowerCase() === 'r') {
        update(selected.id, { rotation: (selected.rotation + 15) % 360 });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // pointer interactions
  const drag = useRef<null | { kind: 'move' | 'resize' | 'rotate' | 'pan'; id?: number; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; start: Plan; cx?: number; cy?: number }>(null);

  const toCanvas = (clientX: number, clientY: number) => {
    const r = viewport.current!.getBoundingClientRect();
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  };

  const startTable = (e: React.PointerEvent, t: Table, kind: 'move' | 'resize' | 'rotate') => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSel(t.id);
    if (!plan) return;
    drag.current = { kind, id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, ow: t.width, oh: t.height, start: plan, cx: t.x + t.width / 2, cy: t.y + t.height / 2 };
  };
  const startPan = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvas) return;
    setSel(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, ow: 0, oh: 0, start: plan! };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / (d.kind === 'pan' ? 1 : zoom);
    const dy = (e.clientY - d.sy) / (d.kind === 'pan' ? 1 : zoom);
    if (d.kind === 'pan') return setPan({ x: d.ox + dx, y: d.oy + dy });
    const t = plan?.tables.find((x) => x.id === d.id);
    if (!t) return;
    if (d.kind === 'move') update(t.id, { x: clamp(snap(d.ox + dx, snapOn), 0, CANVAS.w - t.width), y: clamp(snap(d.oy + dy, snapOn), 0, CANVAS.h - t.height) }, false);
    if (d.kind === 'resize') {
      const w = clamp(snap(d.ow + dx, snapOn), 40, 400);
      const h = t.shape === 'rect' ? clamp(snap(d.oh + dy, snapOn), 40, 400) : w;
      update(t.id, { width: w, height: h }, false);
    }
    if (d.kind === 'rotate') {
      const p = toCanvas(e.clientX, e.clientY);
      let deg = (Math.atan2(p.y - d.cy!, p.x - d.cx!) * 180) / Math.PI + 90;
      deg = snapOn ? Math.round(deg / 15) * 15 : Math.round(deg);
      update(t.id, { rotation: ((deg % 360) + 360) % 360 }, false);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'pan' || !plan) return;
    if (JSON.stringify(d.start) !== JSON.stringify(plan)) setHistory((h) => ({ past: [...h.past.slice(-60), d.start], future: [] }));
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY > 0 ? 0.92 : 1.08), 0.3, 2));
  };

  if (!plan) return <div className="grid h-80 place-items-center"><Spinner /></div>;
  const area = plan.areas.find((a) => a.id === areaId);

  return (
    <div className={cx('grid gap-4', !compact && 'xl:grid-cols-[1fr_300px]')}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
            {plan.areas.map((a) => (
              <button key={a.id} onClick={() => { setAreaId(a.id); setSel(null); }} className={cx('h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold', a.id === areaId ? 'bg-surface-3 text-fg' : 'text-muted')}>
                {a.name} <span className="tabular text-subtle">{plan.tables.filter((t) => t.area_id === a.id).length}</span>
              </button>
            ))}
            <button onClick={addArea} className="h-8 shrink-0 rounded-lg px-2 text-muted hover:text-fg" aria-label="Нова зона"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="flex gap-1">
            <Button size="sm" icon={<Circle className="h-3.5 w-3.5" />} onClick={() => addTable('round')}>Кръгла</Button>
            <Button size="sm" icon={<Square className="h-3.5 w-3.5" />} onClick={() => addTable('square')}>Квадратна</Button>
            <Button size="sm" icon={<RectangleHorizontal className="h-3.5 w-3.5" />} onClick={() => addTable('rect')}>Правоъгълна</Button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={undo} disabled={!history.past.length} aria-label="Отмени" icon={<Undo2 className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" onClick={redo} disabled={!history.future.length} aria-label="Повтори" icon={<Redo2 className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => clamp(z / 1.15, 0.3, 2))} aria-label="Намали" icon={<Minus className="h-4 w-4" />} />
            <span className="tabular w-11 text-center text-[12px] text-muted">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => setZoom((z) => clamp(z * 1.15, 0.3, 2))} aria-label="Увеличи" icon={<Plus className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(clamp((viewport.current?.clientWidth ?? 1000) / 1300, 0.35, 1)); }} aria-label="Побери" icon={<Maximize className="h-4 w-4" />} />
            <Button size="sm" variant={snapOn ? 'secondary' : 'ghost'} onClick={() => setSnapOn((v) => !v)} aria-pressed={snapOn} icon={<Grid2x2 className="h-4 w-4" />}>Мрежа</Button>
          </div>
        </div>

        <div
          ref={viewport}
          className="relative h-[min(62vh,620px)] touch-none select-none overflow-hidden rounded-2xl border border-line bg-surface-2"
          onPointerDown={startPan}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={onWheel}
          role="application"
          aria-label="План на залата. Изберете маса и използвайте стрелките за преместване."
        >
          <div
            data-canvas="1"
            className="absolute left-0 top-0 origin-top-left rounded-xl border border-dashed border-line-strong"
            style={{
              width: CANVAS.w,
              height: CANVAS.h,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              backgroundImage: snapOn ? 'radial-gradient(circle at 1px 1px, var(--line-strong) 1px, transparent 0)' : undefined,
              backgroundSize: `${GRID}px ${GRID}px`,
            }}
          >
            <div className="pointer-events-none absolute left-4 top-3 text-[13px] font-semibold uppercase tracking-wider text-subtle">{area?.name}</div>
            {tables.map((t) => {
              const isSel = t.id === sel;
              return (
                <div
                  key={t.id}
                  className="absolute"
                  style={{ left: t.x, top: t.y, width: t.width, height: t.height, transform: `rotate(${t.rotation}deg)` }}
                >
                  <div
                    onPointerDown={(e) => startTable(e, t, 'move')}
                    tabIndex={0}
                    onFocus={() => setSel(t.id)}
                    role="button"
                    aria-label={`${t.label}, ${t.seats} места`}
                    className={cx(
                      'group relative flex h-full w-full cursor-move flex-col items-center justify-center border-2 bg-surface text-center shadow-sm transition-[border-color,box-shadow] outline-none',
                      t.shape === 'round' ? 'rounded-full' : 'rounded-2xl',
                      isSel ? 'border-accent shadow-[0_0_0_4px_var(--accent-soft)]' : 'border-line-strong hover:border-muted',
                    )}
                  >
                    <span className="tabular text-[22px] font-bold leading-none">{String(t.number).padStart(2, '0')}</span>
                    <span className="mt-1 text-[11px] text-muted">{t.seats} места</span>
                    {/* seat dots */}
                    {Array.from({ length: Math.min(t.seats, 12) }).map((_, i) => {
                      const a = (i / Math.min(t.seats, 12)) * Math.PI * 2;
                      return <span key={i} className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-line-strong" style={{ left: `calc(50% + ${Math.cos(a) * (t.width / 2 + 9)}px - 5px)`, top: `calc(50% + ${Math.sin(a) * (t.height / 2 + 9)}px - 5px)` }} />;
                    })}
                  </div>
                  {isSel && (
                    <>
                      <div onPointerDown={(e) => startTable(e, t, 'resize')} className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-md border-2 border-accent bg-surface" aria-hidden />
                      <div onPointerDown={(e) => startTable(e, t, 'rotate')} className="absolute -top-9 left-1/2 grid h-7 w-7 -translate-x-1/2 cursor-grab place-items-center rounded-full border-2 border-accent bg-surface" aria-hidden>
                        <RotateCw className="h-3.5 w-3.5 text-accent" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-bg/80 px-2.5 py-1.5 text-[11.5px] text-muted backdrop-blur">
            <Move className="h-3.5 w-3.5" /> Влачете фона за преместване · Ctrl+колелце за мащаб · R завърта
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-muted">{dirty ? <Badge tone="warn" dot>Незапазени промени</Badge> : <Badge tone="ok" dot>Запазено в базата данни</Badge>}</div>
          <div className="flex gap-2">
            {dirty && <Button variant="ghost" onClick={() => load()}>Отказ</Button>}
            <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>Запази плана</Button>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        {area && (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 text-[13px] font-semibold">Зона</div>
            <div className="grid gap-3">
              <Field label="Име"><Input value={area.name} onChange={(e) => commit({ ...plan, areas: plan.areas.map((a) => (a.id === area.id ? { ...a, name: e.target.value } : a)) })} /></Field>
              <Field label="Тип">
                <Select value={area.kind} onChange={(e) => commit({ ...plan, areas: plan.areas.map((a) => (a.id === area.id ? { ...a, kind: e.target.value as Area['kind'] } : a)) })}>
                  <option value="indoor">Зала</option><option value="terrace">Тераса</option><option value="bar">Бар</option><option value="private">Сепаре</option>
                </Select>
              </Field>
              {plan.areas.length > 1 && (
                <Button size="sm" variant="danger" onClick={() => {
                  if (plan.tables.some((t) => t.area_id === area.id)) return toast.error(new Error('Преместете или изтрийте масите в зоната първо.'));
                  commit({ ...plan, areas: plan.areas.filter((a) => a.id !== area.id) });
                  setAreaId(plan.areas.find((a) => a.id !== area.id)?.id ?? null);
                }}>Изтрий зоната</Button>
              )}
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 text-[13px] font-semibold">{selected ? `Маса ${selected.number}` : 'Изберете маса'}</div>
          {selected ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Номер"><Input type="number" min={1} value={selected.number} onChange={(e) => update(selected.id, { number: Number(e.target.value) || 1, label: `Маса ${String(Number(e.target.value) || 1).padStart(2, '0')}` })} /></Field>
              <Field label="Места"><Input type="number" min={1} max={40} value={selected.seats} onChange={(e) => update(selected.id, { seats: clamp(Number(e.target.value) || 1, 1, 40) })} /></Field>
              <Field label="Форма" className="col-span-2">
                <Select value={selected.shape} onChange={(e) => { const shape = e.target.value as Table['shape']; update(selected.id, { shape, height: shape === 'rect' ? selected.height : selected.width }); }}>
                  <option value="round">Кръгла</option><option value="square">Квадратна</option><option value="rect">Правоъгълна</option>
                </Select>
              </Field>
              <Field label="X"><Input type="number" value={selected.x} onChange={(e) => update(selected.id, { x: clamp(Number(e.target.value), 0, CANVAS.w) })} /></Field>
              <Field label="Y"><Input type="number" value={selected.y} onChange={(e) => update(selected.id, { y: clamp(Number(e.target.value), 0, CANVAS.h) })} /></Field>
              <Field label="Ширина"><Input type="number" value={selected.width} onChange={(e) => update(selected.id, { width: clamp(Number(e.target.value), 40, 400) })} /></Field>
              <Field label="Завъртане°"><Input type="number" value={selected.rotation} onChange={(e) => update(selected.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })} /></Field>
              <Field label="Зона" className="col-span-2">
                <Select value={selected.area_id} onChange={(e) => update(selected.id, { area_id: Number(e.target.value) })}>
                  {plan.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={duplicate}>Дублирай</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={remove}>Изтрий</Button>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">Кликнете маса на плана или я изберете с Tab. Стрелки — преместване, Shift — по-голяма стъпка, R — завъртане, Delete — изтриване, Ctrl+Z / Ctrl+Y — отмяна / повтаряне.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
