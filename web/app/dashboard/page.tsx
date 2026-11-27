import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { mapNote, NOTE_SELECT } from '@/lib/notes';
import type { Folder, Profile, SharedCollection, Tag } from '@/lib/types';
import Dashboard from './Dashboard';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const uid = auth.user.id;

  const [notes, folders, tags, profile, shares, pdfs] = await Promise.all([
    supabase.from('notes').select(NOTE_SELECT).eq('user_id', uid).order('created_at', { ascending: false }).limit(2000),
    supabase.from('folders').select('id,name,parent_id').eq('user_id', uid).order('name'),
    supabase.from('tags').select('id,name').eq('user_id', uid).order('name'),
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('shared_collections').select('*').eq('user_id', uid),
    supabase.from('pdf_files').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);

  return (
    <Dashboard
      initialNotes={(notes.data ?? []).map(mapNote)}
      initialFolders={(folders.data as Folder[]) ?? []}
      initialTags={(tags.data as Tag[]) ?? []}
      profile={(profile.data as Profile) ?? null}
      initialShares={(shares.data as SharedCollection[]) ?? []}
      pdfCount={pdfs.count ?? 0}
      email={auth.user.email ?? ''}
      loadError={notes.error?.message ?? null}
    />
  );
}
