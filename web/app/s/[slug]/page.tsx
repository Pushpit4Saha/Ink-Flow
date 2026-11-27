// Public, read-only page for a shared note, folder or tag. No login needed.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import NoteCards from '@/components/NoteCards';
import { createClient } from '@/lib/supabase/server';
import { mapNote, NOTE_SELECT } from '@/lib/notes';
import { APP_NAME } from '@/lib/brand';
import type { Note } from '@/lib/types';

async function load(slug: string): Promise<{ title: string; notes: Note[] } | null> {
  const supabase = await createClient();

  const { data: one } = await supabase.from('notes').select(NOTE_SELECT).eq('share_slug', slug).eq('is_public', true).maybeSingle();
  if (one) return { title: one.title, notes: [mapNote(one)] };

  const { data: sc } = await supabase.from('shared_collections').select('*').eq('share_slug', slug).eq('is_public', true).maybeSingle();
  if (!sc) return null;

  if (sc.folder_id) {
    const [{ data: folder }, { data: notes }] = await Promise.all([
      supabase.from('folders').select('name').eq('id', sc.folder_id).maybeSingle(),
      supabase.from('notes').select(NOTE_SELECT).eq('folder_id', sc.folder_id).order('created_at', { ascending: false }),
    ]);
    return { title: folder?.name ?? 'Shared notes', notes: (notes ?? []).map(mapNote) };
  }
  const { data: tag } = await supabase.from('tags').select('name').eq('id', sc.tag_id).maybeSingle();
  const { data: links } = await supabase.from('note_tags').select('note_id').eq('tag_id', sc.tag_id);
  const ids = (links ?? []).map((l) => l.note_id);
  const { data: notes } = ids.length
    ? await supabase.from('notes').select(NOTE_SELECT).in('id', ids).order('created_at', { ascending: false })
    : { data: [] };
  return { title: tag ? `#${tag.name}` : 'Shared notes', notes: (notes ?? []).map(mapNote) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await load((await params).slug);
  return { title: data ? `${data.title} — ${APP_NAME}` : APP_NAME };
}

export default async function SharedPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-3xl p-5 sm:p-10">
      <header className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-12 w-12 rounded-full" />
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Shared notes</p>
          <h1 className="font-title text-3xl">{data.title}</h1>
        </div>
      </header>
      {data.notes.length ? <NoteCards notes={data.notes} /> : <p className="text-muted">No notes here yet.</p>}
      <footer className="mt-12 text-center text-sm text-muted">
        Made with <Link href="/" className="font-lobster text-brand-dark underline">{APP_NAME}</Link> — sticky notes for anything you read.
      </footer>
    </main>
  );
}
