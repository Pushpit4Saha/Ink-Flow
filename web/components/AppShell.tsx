'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { APP_NAME } from '@/lib/brand';

/** Page frame: sidebar on desktop, slide-in drawer on phones. */
export default function AppShell({
  email,
  sidebar,
  children,
}: {
  email: string;
  sidebar?: (close: () => void) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const path = usePathname();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const nav = (close: () => void) => (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="mb-5 flex items-center gap-2 px-2 text-lg font-bold" onClick={close}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-9 w-9 rounded-full" /> <span className="font-lobster text-xl">{APP_NAME}</span>
      </Link>
      <nav className="mb-4 flex flex-col gap-0.5 text-sm">
        {[
          ['/dashboard', '🗒️ Notes'],
          ['/pdfs', '📄 PDF library'],
          ['/settings', '⚙️ Settings'],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={`rounded-md px-2 py-1.5 ${path.startsWith(href) ? 'bg-paper font-semibold text-brand-dark' : 'hover:bg-paper/60'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">{sidebar?.(close)}</div>
      <div className="border-t border-line pt-3 text-xs text-muted">
        <p className="truncate">{email}</p>
        <button onClick={signOut} className="mt-1 underline">
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white/70 p-4 md:block">{nav(() => {})}</aside>

      {menu && (
        <div className="no-print fixed inset-0 z-40 md:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute left-0 top-0 h-full w-72 bg-cream p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {nav(() => setMenu(false))}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-cream/95 px-4 py-2 backdrop-blur md:hidden">
          <button onClick={() => setMenu(true)} className="rounded-md border border-line px-2.5 py-1" aria-label="Menu">
            ☰
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-full" />
          <span className="font-lobster text-lg">{APP_NAME}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
