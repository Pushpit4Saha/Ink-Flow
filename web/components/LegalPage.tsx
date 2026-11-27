import Link from 'next/link';
import { APP_NAME } from '@/lib/brand';

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-10">
      <Link href="/" className="mb-6 flex items-center gap-2 font-bold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-8 w-8 rounded-full" /> <span className="font-lobster text-lg">{APP_NAME}</span>
      </Link>
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-muted">Last updated: [DATE]</p>
      <div className="space-y-4 leading-relaxed [&_h2]:mt-6 [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
    </main>
  );
}
