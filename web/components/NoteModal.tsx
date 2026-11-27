'use client';
import { useCallback, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { createClient } from '@/lib/supabase/client';
import { COLORS, noteBlockColor } from '@/lib/brand';
import { IMG_BUCKET, mapNote, makeSlug, NOTE_SELECT, niceDate, sourceLink } from '@/lib/notes';
import type { Folder, Note, Profile, Tag, TextAnchor } from '@/lib/types';
import RichEditor from './RichEditor';

/** Fields for a brand-new note (from the web PDF viewer) */
export interface NoteDraft {
  title: string;
  anchor: TextAnchor | null;
  context_sentence: string | null;
  source_type: Note['source_type'];
  source_url: string | null;
  page_title: string | null;
  pdf_fingerprint: string | null;
  pdf_page_number: number | null;
}

export default function NoteModal({
  note,
  draft,
  folders,
  tags: allTags,
  profile,
  onClose,
  onSaved,
  onDeleted,
}: {
  note?: Note;
  draft?: NoteDraft;
  folders: Folder[];
  tags: Tag[];
  profile: Profile | null;
  onClose: () => void;
  onSaved: (n: Note, created: { folder?: Folder; tags: Tag[] }) => void;
  onDeleted?: (id: string) => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState(note?.title ?? draft?.title ?? '');
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState(note?.folder_id ?? '');
  const [newFolder, setNewFolder] = useState('');
  const [color, setColor] = useState(note?.highlight_color || profile?.highlight_color || COLORS[0].hex);
  const [keptImages, setKeptImages] = useState(note?.images ?? []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [isPublic, setIsPublic] = useState(note?.is_public ?? false);
  const [slug, setSlug] = useState(note?.share_slug ?? null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onReady = useCallback((e: Editor) => (editorRef.current = e), []);

  const initialBody: JSONContent | string | null = note
    ? ((note.body_json as JSONContent | null) ?? (note.body_text ? note.body_text.split('\n').map((l) => `<p>${escapeHtml(l)}</p>`).join('') : null))
    : null;

  const addTag = (t: string) => {
    const v = t.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const suggest = async () => {
    setAiBusy(true);
    setErr(null);
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: title,
        context: note?.context_sentence ?? draft?.context_sentence ?? '',
        title: note?.page_title ?? draft?.page_title ?? '',
        language: profile?.ai_language ?? 'English',
      }),
    });
    setAiBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(json.error ?? 'AI suggestion failed');
    if (!json.suggestion) return setErr('No suggestion found for this text.');
    editorRef.current?.chain().focus().insertContent(json.suggestion).run();
  };

  const save = async () => {
    const editor = editorRef.current;
    if (!title.trim() || !editor) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user!.id;
      const created: { folder?: Folder; tags: Tag[] } = { tags: [] };

      let fId: string | null = folderId || null;
      if (folderId === '__new' && newFolder.trim()) {
        const { data, error } = await supabase.from('folders').insert({ name: newFolder.trim() }).select('id,name,parent_id').single();
        if (error) throw error;
        created.folder = data;
        fId = data.id;
      } else if (folderId === '__new') fId = null;

      const fields = {
        title: title.trim(),
        body_text: editor.getText().trim(),
        body_json: editor.isEmpty ? null : editor.getJSON(),
        folder_id: fId,
        highlight_color: color,
      };

      let id = note?.id;
      if (id) {
        const { error } = await supabase.from('notes').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('notes').insert({ ...draft, ...fields }).select('id').single();
        if (error) throw error;
        id = data.id;
      }

      // tags
      const names = [...new Set([...tags, ...(tagInput.trim() ? [tagInput.trim()] : [])])];
      await supabase.from('note_tags').delete().eq('note_id', id);
      if (names.length) {
        const { data: tagRows, error } = await supabase
          .from('tags')
          .upsert(names.map((name) => ({ user_id: uid, name })), { onConflict: 'user_id,name' })
          .select('id,name');
        if (error) throw error;
        created.tags = tagRows.filter((t) => !allTags.some((a) => a.id === t.id));
        await supabase.from('note_tags').insert(tagRows.map((t) => ({ note_id: id, tag_id: t.id })));
      }

      // photos removed
      const removed = (note?.images ?? []).filter((im) => !keptImages.some((k) => k.id === im.id));
      if (removed.length) {
        await supabase.storage.from(IMG_BUCKET).remove(removed.map((r) => r.path));
        await supabase.from('note_images').delete().in('id', removed.map((r) => r.id));
      }
      // photos added
      for (const f of newImages) {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${uid}/${id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from(IMG_BUCKET).upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        await supabase.from('note_images').insert({ note_id: id, storage_path: path });
      }

      const { data: full, error: fErr } = await supabase.from('notes').select(NOTE_SELECT).eq('id', id).single();
      if (fErr) throw fErr;
      onSaved(mapNote(full), created);
    } catch (e) {
      setErr(e instanceof Error ? e.message : (e as { message?: string }).message ?? String(e));
    }
    setBusy(false);
  };

  const del = async () => {
    if (!note || !confirm('Delete this note?')) return;
    setBusy(true);
    if (note.images.length) await supabase.storage.from(IMG_BUCKET).remove(note.images.map((i) => i.path));
    const { error } = await supabase.from('notes').delete().eq('id', note.id);
    setBusy(false);
    if (error) setErr(error.message);
    else onDeleted?.(note.id);
  };

  const toggleShare = async () => {
    if (!note) return;
    const next = !isPublic;
    const s = slug ?? makeSlug();
    const { error } = await supabase.from('notes').update({ is_public: next, share_slug: s }).eq('id', note.id);
    if (error) return setErr(error.message);
    setIsPublic(next);
    setSlug(s);
  };

  const shareUrl = slug ? `${typeof location !== 'undefined' ? location.origin : ''}/s/${slug}` : '';
  const link = note ? sourceLink(note) : null;
  const tagMatches = tagInput.trim()
    ? allTags.filter((t) => t.name.toLowerCase().includes(tagInput.trim().toLowerCase()) && !tags.includes(t.name)).slice(0, 6)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border-t-4 border-brand p-5 shadow-2xl sm:rounded-2xl"
        style={{ background: noteBlockColor(color) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">{note ? 'Sticky note' : 'New note'}</span>
          <div className="ml-auto flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                title={c.name}
                onClick={() => setColor(c.hex)}
                className={`h-5 w-5 rounded-full border-2 border-white ${color === c.hex ? 'ring-2 ring-ink' : 'ring-1 ring-black/10'}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <button onClick={onClose} className="ml-2 text-2xl leading-none text-muted" aria-label="Close">
            ×
          </button>
        </div>

        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          className="font-title w-full resize-none bg-transparent text-2xl leading-snug outline-none"
        />

        <div className="rounded-lg bg-white/50 p-2">
          <RichEditor initial={initialBody} onReady={onReady} />
        </div>
        <div className="mt-1 flex justify-end">
          <button onClick={suggest} disabled={aiBusy || !title.trim()} className="rounded-full border border-blue bg-white px-3 py-0.5 text-xs text-[#3f6f94] disabled:opacity-60">
            {aiBusy ? '✨ thinking…' : '✨ Suggest meaning'}
          </button>
        </div>

        {/* photos */}
        <div className="mt-3 flex flex-wrap gap-2">
          {keptImages.map((im) => (
            <div key={im.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-black/10 bg-white">
              <a href={im.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="" className="h-full w-full object-cover" />
              </a>
              <button onClick={() => setKeptImages(keptImages.filter((k) => k.id !== im.id))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white">
                ×
              </button>
            </div>
          ))}
          {newImages.map((f, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-black/10 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
              <button onClick={() => setNewImages(newImages.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white">
                ×
              </button>
            </div>
          ))}
          <button onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-lg border-2 border-dashed border-black/15 text-2xl text-muted">
            📷
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) setNewImages([...newImages, ...e.target.files]);
              e.target.value = '';
            }}
          />
        </div>

        {/* tags */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-blue/60 bg-white px-2 text-sm text-[#3f6f94]">
              #{t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="+ add tag"
            className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none"
          />
        </div>
        {tagMatches.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tagMatches.map((t) => (
              <button key={t.id} onClick={() => addTag(t.name)} className="rounded-full border border-dashed border-blue bg-white px-2 text-xs">
                #{t.name}
              </button>
            ))}
          </div>
        )}

        {/* folder */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          📁
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="rounded-md border border-black/10 bg-white/70 px-2 py-1">
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value="__new">+ New folder…</option>
          </select>
          {folderId === '__new' && (
            <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" className="rounded-md border border-black/10 bg-white px-2 py-1" />
          )}
        </div>

        {(note?.context_sentence || draft?.context_sentence) && (
          <blockquote className="mt-3 border-l-4 border-brand/50 pl-3 text-sm italic text-muted">“{note?.context_sentence ?? draft?.context_sentence}”</blockquote>
        )}

        {note && (
          <div className="mt-3 space-y-1 text-sm">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand-dark underline">
                {note.page_title || note.source_url}
              </a>
            ) : (
              <p className="truncate text-muted">{note.page_title}</p>
            )}
            <p className="text-xs text-muted">
              Added {niceDate(note.created_at)}
              {note.pdf_page_number ? ` · page ${note.pdf_page_number}` : ''}
            </p>
            <label className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={isPublic} onChange={toggleShare} className="accent-brand" />
              Share this note with a public link
            </label>
            {isPublic && slug && (
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="flex-1 rounded border border-black/10 bg-white px-2 py-1 text-xs" />
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
              </div>
            )}
          </div>
        )}

        {err && <p className="mt-3 text-sm text-red-700">{err}</p>}

        <div className="mt-5 flex items-center gap-2">
          {note && (
            <button onClick={del} disabled={busy} className="text-sm text-red-700 underline">
              Delete
            </button>
          )}
          <button onClick={onClose} className="ml-auto px-3 py-2 text-sm text-muted">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !title.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
