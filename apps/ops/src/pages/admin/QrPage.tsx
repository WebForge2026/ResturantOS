import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { mutate } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranchQuery } from '@/lib/queries';
import { Button, Card, Field, Input, Spinner, toast } from '@/components/ui';
import { PageHeader } from '@/layouts/AdminLayout';

type QrRow = { id: number; number: number; label: string; qr_token: string; qr_rotated_at: string | null };

const defaultBase = () => {
  try {
    return localStorage.getItem('noar.qrBase') ?? `${window.location.protocol}//${window.location.hostname}:3000`;
  } catch {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
};

export function QrCodes() {
  const { data, isLoading } = useBranchQuery<{ data: QrRow[] }>(['qr'], '/qr-codes');
  const qc = useQueryClient();
  const branchId = useAuth((s) => s.branchId);
  const [base, setBase] = useState(defaultBase);
  useEffect(() => {
    try {
      localStorage.setItem('noar.qrBase', base);
    } catch {
      /* ignore */
    }
  }, [base]);

  if (isLoading || !data) return <div className="grid h-40 place-items-center"><Spinner /></div>;

  const rotate = async (row: QrRow) => {
    if (!confirm(`Нов QR код за ${row.label}? Старият отпечатан код спира да работи.`)) return;
    try {
      await mutate(`/tables/${row.id}/rotate-qr`, 'POST');
      toast.ok('QR кодът е подменен');
      void qc.invalidateQueries({ queryKey: ['b', branchId, 'qr'] });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Адрес на QR менюто" hint="За тест от телефон в същата мрежа използвайте LAN IP адреса на компютъра, напр. http://192.168.1.20:3000" className="min-w-[280px] flex-1">
          <Input value={base} onChange={(e) => setBase(e.target.value.replace(/\/$/, ''))} />
        </Field>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Печат на всички</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 print:grid-cols-3">
        {data.data.map((r) => <QrCard key={r.id} row={r} url={`${base}/?t=${encodeURIComponent(r.qr_token)}`} onRotate={() => rotate(r)} />)}
      </div>
    </div>
  );
}

function QrCard({ row, url, onRotate }: { row: QrRow; url: string; onRotate: () => void }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#050507', light: '#ffffff' } }).then(setSvg).catch(() => setSvg(''));
  }, [url]);
  const download = async () => {
    const png = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
    const a = document.createElement('a');
    a.href = png;
    a.download = `noar-qr-${String(row.number).padStart(2, '0')}.png`;
    a.click();
  };
  return (
    <Card className="flex flex-col items-center p-4 text-center break-inside-avoid">
      <div className="text-[15px] font-bold">{row.label}</div>
      <div className="mt-3 w-full max-w-[180px] overflow-hidden rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="mt-2 text-[11px] text-subtle">Сканирайте за меню и поръчка</div>
      <div className="mt-3 flex gap-1 print:hidden">
        <Button size="sm" variant="ghost" onClick={download} aria-label="Изтегли PNG" icon={<Download className="h-3.5 w-3.5" />} />
        <a href={url} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-surface-2" aria-label="Преглед"><ExternalLink className="h-3.5 w-3.5" /></a>
        <Button size="sm" variant="ghost" onClick={onRotate} aria-label="Нов код" icon={<RefreshCw className="h-3.5 w-3.5" />} />
      </div>
    </Card>
  );
}

export function QrPage() {
  return (
    <div>
      <PageHeader title="QR кодове" subtitle="Уникален случаен токен за всяка маса. Подмяната обезсилва стария код." />
      <QrCodes />
    </div>
  );
}
