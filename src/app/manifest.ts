import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Rental Units | وحدات الإيجار',
    short_name: 'Rental | الإيجار',
    description: 'Rental units management | إدارة وحدات الإيجار',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f8fa',
    theme_color: '#1d4ed8',
    prefer_related_applications: false,
    // Language and direction are intentionally omitted because this shared manifest
    // serves both locale routes; each rendered document supplies the correct values.
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
