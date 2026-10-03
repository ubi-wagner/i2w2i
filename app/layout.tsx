import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppSetup } from '@/components/pwa/AppSetup';

export const metadata: Metadata = {
  title: { default: 'i2w2i', template: '%s · i2w2i' },
  description: 'Our family apps.',
  robots: { index: false, follow: false },
  // Home-screen app on iPhone: its own icon, full screen, named i2w2i.
  appleWebApp: { capable: true, title: 'i2w2i', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#7c3aed' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
        <AppSetup />
      </body>
    </html>
  );
}
