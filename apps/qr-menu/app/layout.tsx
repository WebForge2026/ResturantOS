import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/manrope';

import './globals.css';

export const metadata: Metadata = {
  title: 'NOAR BAR & DINNER — Меню',
  description: 'Дигитално меню и поръчка от масата — NOAR BAR & DINNER',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4eee4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body className="min-h-dvh bg-linen">{children}</body>
    </html>
  );
}
