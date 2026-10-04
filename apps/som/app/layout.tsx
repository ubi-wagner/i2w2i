import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppSetup } from '@/components/AppSetup';

export const metadata: Metadata = {
  title: { default: 'S-O-M', template: '%s · S-O-M' },
  description: 'Private.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'S-O-M', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png', icon: '/icons/icon-192.png' },
  referrer: 'no-referrer',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#2138a0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <AppSetup />
      </body>
    </html>
  );
}
