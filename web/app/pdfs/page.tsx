import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { PdfFile } from '@/lib/types';
import PdfLibrary from './PdfLibrary';

export default async function PdfsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const [files, notes] = await Promise.all([
    supabase.from('pdf_files').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false }),
    supabase.from('notes').select('pdf_fingerprint').eq('user_id', auth.user.id).not('pdf_fingerprint', 'is', null),
  ]);
  const counts: Record<string, number> = {};
  (notes.data ?? []).forEach((n) => (counts[n.pdf_fingerprint!] = (counts[n.pdf_fingerprint!] ?? 0) + 1));
  return <PdfLibrary email={auth.user.email ?? ''} initialFiles={(files.data as PdfFile[]) ?? []} noteCounts={counts} />;
}
