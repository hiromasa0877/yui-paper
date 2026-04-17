import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import OfflineBadge from '@/components/OfflineBadge';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-noto-sans-jp',
  preload: true,
});

export const metadata: Metadata = {
  title: '結（ゆい）ペーパー - 紙芳名帳OCR受付',
  description: '葬儀受付DXサービス - 紙芳名帳をスキャンして帳簿化',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1a1a2e" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${notoSansJp.variable} font-sans bg-accent-cream text-accent-dark antialiased`}
      >
        {children}
        <OfflineBadge />
        <ServiceWorkerRegister />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            },
            success: {
              style: {
                background: '#10b981',
                color: 'white',
              },
              iconTheme: {
                primary: 'white',
                secondary: '#10b981',
              },
            },
            error: {
              style: {
                background: '#ef4444',
                color: 'white',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
