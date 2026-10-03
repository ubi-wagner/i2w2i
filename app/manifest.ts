import type { MetadataRoute } from 'next';

// Makes i2w2i installable: "Add to Home Screen" gives an icon that opens
// full screen, and on iPhone that's also what allows notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'i2w2i',
    short_name: 'i2w2i',
    description: 'Our family’s private photo albums and apps.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#7c3aed',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
