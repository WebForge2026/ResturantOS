import { FloorEditor } from '@/components/FloorEditor';
import { PageHeader } from '@/layouts/AdminLayout';

export function FloorPage() {
  return (
    <div>
      <PageHeader title="План на залата" subtitle="Плъзгайте, оразмерявайте и завъртайте масите. Промените се записват в базата данни." />
      <FloorEditor />
    </div>
  );
}
