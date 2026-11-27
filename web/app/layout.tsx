import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/RegisterSW';
import { APP_NAME } from '@/lib/brand';
import { createClient } from '@/lib/supabase/server';
import { fontVars } from '@/lib/brand';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/lobster/400.css';
import '@fontsource/pacifico/400.css';
import '@fontsource/grand-hotel/400.css';
import '@fontsource/fredericka-the-great/400.css';
import './globals.css';

async function userFonts() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return fontVars();
    const { data: p } = await supabase.from('profiles').select('title_font,body_font').eq('id', data.user.id).maybeSingle();
    return fontVars(p?.title_font, p?.body_font);
  } catch {
    return fontVars();
  }
}

export const metadata: Metadata = {
  title: `${APP_NAME} — Your sticky notes`,
  description: 'Sticky notes for anything you read on the web or in PDFs',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#D8A3A7' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = await userFonts();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={fonts as React.CSSProperties}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
