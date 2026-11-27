'use client';
// Print-friendly export. The browser's print dialog lets you "Save as PDF" (works on phones too).
import { useEffect, useState } from 'react';
import NoteCards from '@/components/NoteCards';
import { createClient } from '@/lib/supabase/client';
import { mapNote, NOTE_SELECT, niceDate } from '@/lib/notes';
import { APP_NAME } from '@/lib/brand';
import type { Note } from '@/lib/types';

export default function PrintPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [heading, setHeading] = useState('My notes');

  useEffect(() => {
    const raw = sessionStorage.getItem('exportNotes');
    if (!raw) return setNotes([]);
    const { ids, heading } = JSON.parse(raw) as { ids: string[]; heading: string };
    setHeading(heading);
    (async () => {
      const supabase = createClient();
      const out: Note[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('notes').select(NOTE_SELECT).in('id', ids.slice(i, i + 200));
        out.push(...(data ?? []).map(mapNote));
      }
      const order = new Map(ids.map((id, i) => [id, i]));
      out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      setNotes(out);
    })();
  }, []);

  useEffect(() => {
    if (!notes?.length) return;
    document.title = heading;
    // wait for photos to load, then open the print dialog
    const imgs = [...document.images];
    Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => (im.onload = im.onerror = r))))).then(() => setTimeout(() => window.print(), 300));
  }, [notes, heading]);

  if (!notes) return <p className="p-8 text-muted">Preparing…</p>;
  if (!notes.length) return <p className="p-8 text-muted">Nothing to export. Go back to the dashboard and choose Export again.</p>;

  return (
    <main className="mx-auto max-w-3xl bg-white p-6 sm:p-10">
      <div className="no-print mb-6 flex items-center gap-3 rounded-lg bg-paper p-3 text-sm">
        In the print window choose <b>“Save as PDF”</b> as the printer.
        <button onClick={() => window.print()} className="ml-auto rounded bg-brand px-3 py-1.5 font-semibold text-white">
          Print / Save PDF
        </button>
      </div>
      <header className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-12 w-12 rounded-full" />
        <div>
          <h1 className="font-title text-3xl">{heading}</h1>
          <p className="text-sm text-muted">
            {notes.length} notes · {niceDate(new Date().toISOString())} · <span className="font-lobster">{APP_NAME}</span>
          </p>
        </div>
      </header>
      <NoteCards notes={notes} />
    </main>
  );
}
