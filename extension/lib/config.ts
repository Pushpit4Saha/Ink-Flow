export const SUPABASE_URL = import.meta.env.WXT_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.WXT_SUPABASE_ANON_KEY as string;
export const DASHBOARD_URL = ((import.meta.env.WXT_DASHBOARD_URL as string) || 'http://localhost:3000').replace(/\/$/, '');

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('YOUR-PROJECT'));

export const APP_NAME = 'Ink&Flow';
