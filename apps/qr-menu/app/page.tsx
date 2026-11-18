import { Suspense } from 'react';
import { QrApp } from '@/components/QrApp';

export default function Page() {
  return (
    <Suspense>
      <QrApp />
    </Suspense>
  );
}
