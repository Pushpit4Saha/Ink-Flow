import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { mapNote, NOTE_SELECT } from '@/lib/notes';
import type { Folder, PdfFile, Profile, Tag } from '@/lib/types';
import PdfReader from './PdfReader';
import 'pdfjs-dist/web/pdf_viewer.css';

export default async function PdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const uid = auth.user.id;

  const { data: file } = await supabase.from('pdf_files').select('*').eq('id', id).eq('user_id', uid).maybeSingle();
  if (!file) notFound();
  const [signed, notes, folders, tags, profile] = await Promise.all([
    supabase.storage.from('pdfs').createSignedUrl(file.storage_path, 60 * 60 * 6),
    file.fingerprint
      ? supabase.from('notes').select(NOTE_SELECT).eq('user_id', uid).eq('pdf_fingerprint', file.fingerprint).order('created_at')
      : Promise.resolve({ data: [] }),
    supabase.from('folders').select('id,name,parent_id').eq('user_id', uid).order('name'),
    supabase.from('tags').select('id,name').eq('user_id', uid).order('name'),
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
  ]);
  if (!signed.data) notFound();

  return (
    <PdfReader
      file={file as PdfFile}
      url={signed.data.signedUrl}
      initialNotes={(notes.data ?? []).map(mapNote)}
      folders={(folders.data as Folder[]) ?? []}
      tags={(tags.data as Tag[]) ?? []}
      profile={(profile.data as Profile) ?? null}
    />
  );
}
