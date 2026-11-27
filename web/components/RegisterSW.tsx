'use client';
import { useEffect } from 'react';

/** Registers the service worker so the app can be installed and open recent pages offline. */
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
