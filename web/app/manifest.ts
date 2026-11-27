import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/brand';

// Makes the website installable as an app on phones and computers (PWA)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'All your sticky notes from everything you read',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FDF8F8',
    theme_color: '#D8A3A7',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
