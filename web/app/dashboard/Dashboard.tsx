'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import NoteModal from '@/components/NoteModal';
import { createClient } from '@/lib/supabase/client';
import { noteBlockColor } from '@/lib/brand';
import { hostOf, makeSlug, niceDate } from '@/lib/notes';
import { exportDocx, exportPdf } from '@/lib/exportDocx';
import type { Folder, Note, Profile, SharedCollection, Tag } from '@/lib/types';

type View = { kind: 'all' } | { kind: 'folder'; id: string } | { kind: 'tag'; name: string } | { kind: 'site'; host: string } | { kind: 'unfiled' };

const DAY = 86400000;

export default function Dashboard({
  initialNotes,
  initialFolders,
  initialTags,
  profile,
  initialShares,
  pdfCount,
  email,
  loadError,
}: {
  initialNotes: Note[];
  initialFolders: Folder[];
  initialTags: Tag[];
  profile: Profile | null;
  initialShares: SharedCollection[];
  pdfCount: number;
  email: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [notes, setNotes] = useState(initialNotes);
  const [folders, setFolders] = useState(initialFolders);
  const [tags, setTags] = useState(initialTags);
  const [shares, setShares] = useState(initialShares);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'web' | 'pdf'>('all');
  const [since, setSince] = useState(0); // days, 0 = any time
  const [open, setOpen] = useState<Note | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setNotes(initialNotes), [initialNotes]);

  // refresh when you come back to this tab (e.g. after adding notes with the extension)
  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [router]);

  // open a note from a link like /dashboard?note=<id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('note');
    if (id) {
      const n = initialNotes.find((x) => x.id === id);
      if (n) setOpen(n);
      history.replaceState(null, '', '/dashboard');
    }
  }, [initialNotes]);

  const sites = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => m.set(hostOf(n.source_url), (m.get(hostOf(n.source_url)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => n.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return m;
  }, [notes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = since ? Date.now() - since * DAY : 0;
    return notes.filter((n) => {
      if (view.kind === 'folder' && n.folder_id !== view.id) return false;
      if (view.kind === 'unfiled' && n.folder_id) return false;
      if (view.kind === 'tag' && !n.tags.includes(view.name)) return false;
      if (view.kind === 'site' && hostOf(n.source_url) !== view.host) return false;
      if (type === 'web' && n.source_type !== 'web') return false;
      if (type === 'pdf' && n.source_type === 'web') return false;
      if (cutoff && new Date(n.created_at).getTime() < cutoff) return false;
      if (!q) return true;
      return [n.title, n.body_text, n.page_title ?? '', n.tags.join(' ')].some((s) => s.toLowerCase().includes(q));
    });
  }, [notes, query, view, type, since]);

  const currentFolder = view.kind === 'folder' ? folders.find((f) => f.id === view.id) : undefined;
  const currentTag = view.kind === 'tag' ? tags.find((t) => t.name === view.name) : undefined;
  const heading =
    view.kind === 'all' ? 'All notes' : view.kind === 'unfiled' ? 'Not in a folder' : view.kind === 'folder' ? `📁 ${currentFolder?.name ?? ''}` : view.kind === 'tag' ? `#${view.name}` : view.host;
  const share = shares.find((s) => (currentFolder && s.folder_id === currentFolder.id) || (currentTag && s.tag_id === currentTag.id));

  // ---- folder actions ----
  const newFolder = async () => {
    const name = prompt('New folder name');
    if (!name?.trim()) return;
    const { data, error } = await supabase.from('folders').insert({ name: name.trim() }).select('id,name,parent_id').single();
    if (error) return alert(error.message);
    setFolders([...folders, data].sort((a, b) => a.name.localeCompare(b.name)));
    setView({ kind: 'folder', id: data.id });
  };
  const renameFolder = async () => {
    if (!currentFolder) return;
    const name = prompt('Rename folder', currentFolder.name);
    if (!name?.trim()) return;
    const { error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', currentFolder.id);
    if (error) return alert(error.message);
    setFolders(folders.map((f) => (f.id === currentFolder.id ? { ...f, name: name.trim() } : f)));
  };
  const deleteFolder = async () => {
    if (!currentFolder || !confirm(`Delete folder "${currentFolder.name}"? The notes inside are kept (they become "not in a folder").`)) return;
    const { error } = await supabase.from('folders').delete().eq('id', currentFolder.id);
    if (error) return alert(error.message);
    setFolders(folders.filter((f) => f.id !== currentFolder.id));
    setNotes(notes.map((n) => (n.folder_id === currentFolder.id ? { ...n, folder_id: null } : n)));
    setView({ kind: 'all' });
  };

  // ---- share a whole folder or tag ----
  const toggleCollectionShare = async () => {
    if (share) {
      const { error } = await supabase.from('shared_collections').update({ is_public: !share.is_public }).eq('id', share.id);
      if (error) return alert(error.message);
      setShares(shares.map((s) => (s.id === share.id ? { ...s, is_public: !s.is_public } : s)));
    } else {
      const { data, error } = await supabase
        .from('shared_collections')
        .insert({ folder_id: currentFolder?.id ?? null, tag_id: currentTag?.id ?? null, share_slug: makeSlug(), is_public: true })
        .select('*')
        .single();
      if (error) return alert(error.message);
      setShares([...shares, data]);
    }
  };

  const doExport = async (kind: 'docx' | 'pdf') => {
    setExportMenu(false);
    if (!shown.length) return alert('No notes to export in this view.');
    const title = heading.replace(/^📁 /, '');
    if (kind === 'pdf') return exportPdf(shown, title);
    setExporting(true);
    try {
      await exportDocx(shown, title);
    } finally {
      setExporting(false);
    }
  };

  const item = (active: boolean) =>
    `flex w-full justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? 'bg-paper font-semibold text-brand-dark' : 'hover:bg-paper/60'}`;
  const label = 'mb-1 mt-4 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wider text-muted';

  const sidebar = (close: () => void) => {
    const go = (v: View) => {
      setView(v);
      close();
    };
    return (
      <div>
        <button className={item(view.kind === 'all')} onClick={() => go({ kind: 'all' })}>
          <span>All notes</span>
          <span className="text-muted">{notes.length}</span>
        </button>
        <div className={label}>
          <span>Folders</span>
          <button onClick={newFolder} className="rounded px-1 text-base leading-none text-brand-dark hover:bg-paper" title="New folder">
            +
          </button>
        </div>
        {folders.map((f) => (
          <button key={f.id} className={item(view.kind === 'folder' && view.id === f.id)} onClick={() => go({ kind: 'folder', id: f.id })}>
            <span className="truncate">📁 {f.name}</span>
            <span className="text-muted">{notes.filter((n) => n.folder_id === f.id).length}</span>
          </button>
        ))}
        <button className={item(view.kind === 'unfiled')} onClick={() => go({ kind: 'unfiled' })}>
          <span className="truncate text-muted">Not in a folder</span>
          <span className="text-muted">{notes.filter((n) => !n.folder_id).length}</span>
        </button>

        {tags.length > 0 && <div className={label}>Tags</div>}
        <div className="flex flex-wrap gap-1 px-2">
          {tags
            .filter((t) => tagCounts.get(t.name))
            .map((t) => (
              <button
                key={t.id}
                onClick={() => go({ kind: 'tag', name: t.name })}
                className={`rounded-full border px-2 text-xs ${view.kind === 'tag' && view.name === t.name ? 'border-blue bg-blue text-white' : 'border-blue/50 bg-white text-[#3f6f94]'}`}
              >
                #{t.name} <span className="opacity-70">{tagCounts.get(t.name)}</span>
              </button>
            ))}
        </div>

        <div className={label}>Websites</div>
        {sites.map(([h, c]) => (
          <button key={h} className={item(view.kind === 'site' && view.host === h)} onClick={() => go({ kind: 'site', host: h })}>
            <span className="truncate">{h}</span>
            <span className="text-muted">{c}</span>
          </button>
        ))}
        <Link href="/pdfs" onClick={close} className="mt-4 block px-2 text-xs text-muted underline">
          {pdfCount} PDF{pdfCount === 1 ? '' : 's'} in your library →
        </Link>
      </div>
    );
  };

  const shareUrl = share ? `${location.origin}/s/${share.share_slug}` : '';

  return (
    <AppShell email={email} sidebar={sidebar}>
      <main className="p-4 md:p-8">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto truncate text-xl font-bold md:text-2xl">{heading}</h1>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-brand sm:w-64"
          />
          <div className="relative">
            <button onClick={() => setExportMenu(!exportMenu)} disabled={exporting} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {exporting ? 'Exporting…' : 'Export ▾'}
            </button>
            {exportMenu && (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                <button onClick={() => doExport('docx')} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">
                  📝 Word (.docx)
                </button>
                <button onClick={() => doExport('pdf')} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">
                  📄 PDF (print / save)
                </button>
              </div>
            )}
          </div>
        </header>

        {/* filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {(['all', 'web', 'pdf'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1 ${type === t ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}>
              {t === 'all' ? 'Everything' : t === 'web' ? 'Web pages' : 'PDFs'}
            </button>
          ))}
          <select value={since} onChange={(e) => setSince(Number(e.target.value))} className="rounded-full bg-white px-3 py-1 ring-1 ring-line">
            <option value={0}>Any time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={365}>Last year</option>
          </select>
          <span className="ml-auto text-muted">{shown.length} notes</span>
        </div>

        {/* folder / tag tools */}
        {(currentFolder || currentTag) && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 text-sm">
            {currentFolder && (
              <>
                <button onClick={renameFolder} className="underline">
                  Rename
                </button>
                <button onClick={deleteFolder} className="text-red-700 underline">
                  Delete folder
                </button>
              </>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(share?.is_public)} onChange={toggleCollectionShare} className="accent-brand" />
              Share this {currentFolder ? 'folder' : 'tag'} with a public link
            </label>
            {share?.is_public && (
              <span className="flex flex-1 gap-2">
                <input readOnly value={shareUrl} className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-xs" />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="rounded bg-green px-2 text-xs font-semibold text-white"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </span>
            )}
          </div>
        )}

        {loadError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            Could not load notes: {loadError}. Did you run both SQL files in Supabase?
          </p>
        )}

        {shown.length === 0 ? (
          <div className="mx-auto mt-20 max-w-md text-center text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="mx-auto mb-4 h-16 w-16 rounded-full opacity-80" />
            {notes.length === 0 ? (
              <p>No notes yet. Install the browser extension, select any text on a web page, and click the flower button.</p>
            ) : (
              <p>No notes match.</p>
            )}
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
            {shown.map((n, i) => (
              <button
                key={n.id}
                onClick={() => setOpen(n)}
                className="note-block mb-4 block w-full break-inside-avoid overflow-hidden rounded-xl border-t-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: noteBlockColor(n.highlight_color), borderColor: noteBlockColor(n.highlight_color), transform: `rotate(${((i % 5) - 2) * 0.2}deg)` }}
              >
                {n.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.images[0].url} alt="" className="max-h-44 w-full object-cover" loading="lazy" />
                )}
                <div className="p-4">
                  <h2 className="font-title line-clamp-3 text-lg leading-snug">{n.title}</h2>
                  {n.body_text && <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-[#4d4446]">{n.body_text}</p>}
                  {n.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.tags.map((t) => (
                        <span key={t} className="rounded-full bg-white/80 px-2 text-xs text-[#3f6f94]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-2 text-xs text-muted">
                    {n.source_type !== 'web' ? (
                      <span>📄</span>
                    ) : (
                      n.favicon_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.favicon_url} alt="" className="h-4 w-4 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )
                    )}
                    <span className="truncate">{n.source_type === 'web' ? hostOf(n.source_url) : n.page_title}</span>
                    <span className="ml-auto shrink-0">{niceDate(n.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {open && (
        <NoteModal
          note={open}
          folders={folders}
          tags={tags}
          profile={profile}
          onClose={() => setOpen(null)}
          onSaved={(u, created) => {
            setNotes((ns) => ns.map((x) => (x.id === u.id ? u : x)));
            if (created.folder) setFolders([...folders, created.folder]);
            if (created.tags.length) setTags([...tags, ...created.tags].sort((a, b) => a.name.localeCompare(b.name)));
            setOpen(null);
          }}
          onDeleted={(id) => {
            setNotes((ns) => ns.filter((x) => x.id !== id));
            setOpen(null);
          }}
        />
      )}
    </AppShell>
  );
}
