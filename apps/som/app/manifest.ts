import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'S-O-M',
    short_name: 'S-O-M',
    description: 'Private.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f6fb',
    theme_color: '#2138a0',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
