// Supabase client — used ONLY in the background service worker,
// so there is a single place that holds and refreshes the login session.
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { browser } from 'wxt/browser';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Store the session in extension storage (localStorage is not available in service workers)
const extensionStorage: SupportedStorage = {
  async getItem(key) {
    const r = await browser.storage.local.get(key);
    return (r[key] as string | undefined) ?? null;
  },
  async setItem(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await browser.storage.local.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL || 'http://invalid.local', SUPABASE_ANON_KEY || 'missing', {
  auth: {
    storage: extensionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
