import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { APP_NAME } from '@/lib/brand';

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect('/dashboard');

  const features = [
    ['🌸', 'Select & note', 'Select any word or sentence on any website, click the flower, write your note.'],
    ['🖍️', 'Highlights come back', 'Open the page again and your notes are highlighted right where you left them.'],
    ['📄', 'PDFs too', 'Online PDFs, files on your computer, or your PDF library — on laptop and phone.'],
    ['✨', 'AI meanings', 'Get a short meaning of what you selected, in English, Bangla and more. Press Tab to use it.'],
    ['🏷️', 'Folders & tags', 'Organise notes with folders and tags, add photos, search everything.'],
    ['📤', 'Export & share', 'Export to Word or PDF, or share a note, folder or tag with a link.'],
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <section className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="mb-5 h-24 w-24 rounded-full shadow-lg" />
        <h1 className="font-lobster text-5xl sm:text-6xl">{APP_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">Sticky notes for anything you read — websites and PDFs. All your notes in one place, on your laptop and your phone.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark">
            Get started — it’s free
          </Link>
        </div>
      </section>
      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([icon, title, text], i) => (
          <div key={title} className="rounded-xl border-t-4 bg-white p-5 shadow-sm" style={{ borderColor: ['#D8A3A7', '#77C599', '#77A3C5'][i % 3] }}>
            <div className="text-2xl">{icon}</div>
            <h2 className="mt-2 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
      <footer className="mt-16 text-center text-sm text-muted">
        <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
      </footer>
    </main>
  );
}
