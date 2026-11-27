'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';
import { loadPdfTools } from '@/lib/pdfjs';
import { niceDate } from '@/lib/notes';
import type { PdfFile } from '@/lib/types';

export default function PdfLibrary({ email, initialFiles, noteCounts }: { email: string; initialFiles: PdfFile[]; noteCounts: Record<string, number> }) {
  const supabase = createClient();
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // /pdfs?fp=<fingerprint>&note=<id> → open the matching PDF
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const fp = p.get('fp');
    if (!fp) return;
    const f = files.find((x) => x.fingerprint === fp);
    if (f) router.replace(`/pdfs/${f.id}${p.get('note') ? `?note=${p.get('note')}` : ''}`);
    else setMsg('That PDF is not in your library yet. Upload the same file and its notes will appear on it.');
  }, [files, router]);

  const upload = async (list: FileList | File[]) => {
    setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user!.id;
    const { openPdf } = await loadPdfTools();
    for (const f of [...list]) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) continue;
      setBusy(`Uploading ${f.name}…`);
      try {
        const pdf = await openPdf({ data: await f.arrayBuffer() });
        const fingerprint = pdf.fingerprints[0] ?? null;
        const path = `${uid}/${crypto.randomUUID()}.pdf`;
        const up = await supabase.storage.from('pdfs').upload(path, f, { contentType: 'application/pdf' });
        if (up.error) throw up.error;
        const { data, error } = await supabase.from('pdf_files').insert({ storage_path: path, fingerprint, file_name: f.name }).select('*').single();
        if (error) throw error;
        setFiles((fs) => [data, ...fs]);
      } catch (e) {
        setMsg(`Could not upload ${f.name}: ${e instanceof Error ? e.message : (e as { message?: string }).message}`);
      }
    }
    setBusy(null);
  };

  const remove = async (f: PdfFile) => {
    if (!confirm(`Remove "${f.file_name}" from your library? Your notes on it are kept.`)) return;
    await supabase.storage.from('pdfs').remove([f.storage_path]);
    await supabase.from('pdf_files').delete().eq('id', f.id);
    setFiles(files.filter((x) => x.id !== f.id));
  };

  return (
    <AppShell email={email}>
      <main className="p-4 md:p-8">
        <h1 className="mb-1 text-xl font-bold md:text-2xl">PDF library</h1>
        <p className="mb-5 text-sm text-muted">Upload PDFs to read and annotate them here — on your laptop or phone. Notes you made on the same PDF with the extension show up automatically.</p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            upload(e.dataTransfer.files);
          }}
          className={`mb-6 rounded-2xl border-2 border-dashed p-8 text-center ${over ? 'border-brand bg-paper' : 'border-brand/50 bg-white'}`}
        >
          <p className="mb-3 text-muted">{busy ?? 'Drop PDF files here, or'}</p>
          <button disabled={Boolean(busy)} onClick={() => input.current?.click()} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Choose PDFs
          </button>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        {msg && <p className="mb-4 rounded-lg border border-brand/40 bg-white p-3 text-sm">{msg}</p>}

        {files.length === 0 ? (
          <p className="text-center text-muted">No PDFs yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                <span className="grid h-12 w-10 shrink-0 place-items-center rounded bg-paper text-xl">📄</span>
                <Link href={`/pdfs/${f.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{f.file_name}</p>
                  <p className="text-xs text-muted">
                    {niceDate(f.created_at)} · {noteCounts[f.fingerprint ?? ''] ?? 0} notes
                  </p>
                </Link>
                <button onClick={() => remove(f)} className="text-xs text-muted underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
