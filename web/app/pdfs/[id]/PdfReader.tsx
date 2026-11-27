'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import NoteModal, { type NoteDraft } from '@/components/NoteModal';
import { loadPdfTools } from '@/lib/pdfjs';
import { anchorFromRange, applyHighlights, HL_TAG, scrollToHighlight } from '@/lib/highlighter';
import { noteBlockColor } from '@/lib/brand';
import type { Folder, Note, PdfFile, Profile, Tag } from '@/lib/types';

function sentence(before: string, text: string, after: string) {
  const b = before.slice(-300);
  const i = Math.max(b.lastIndexOf('. '), b.lastIndexOf('? '), b.lastIndexOf('! '), b.lastIndexOf('\n'));
  const m = after.slice(0, 300).search(/[.?!](\s|$)|\n/);
  return ((i >= 0 ? b.slice(i + 1) : b) + text + (m >= 0 ? after.slice(0, m + 1) : after.slice(0, 300))).replace(/\s+/g, ' ').trim();
}

export default function PdfReader({
  file,
  url,
  initialNotes,
  folders: initialFolders,
  tags: initialTags,
  profile,
}: {
  file: PdfFile;
  url: string;
  initialNotes: Note[];
  folders: Folder[];
  tags: Tag[];
  profile: Profile | null;
}) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef(initialNotes);
  const [notes, setNotes] = useState(initialNotes);
  const [folders, setFolders] = useState(initialFolders);
  const [tags, setTags] = useState(initialTags);
  const [scale, setScale] = useState(0);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selBtn, setSelBtn] = useState<{ x: number; y: number; draft: NoteDraft } | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [open, setOpen] = useState<Note | null>(null);
  const [listOpen, setListOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);
  notesRef.current = notes;

  const paint = useCallback(() => {
    if (pagesRef.current) applyHighlights(pagesRef.current, notesRef.current);
  }, []);

  // load + draw the PDF
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { openPdf, renderPdf } = await loadPdfTools();
        if (!pdfRef.current) pdfRef.current = await openPdf({ url });
        const pdf = pdfRef.current;
        if (cancelled || !pagesRef.current) return;
        setPages(pdf.numPages);
        const s = scale || Math.min(1.6, Math.max(0.55, (pagesRef.current.clientWidth - 16) / 612));
        if (!scale) setScale(s);
        stop = await renderPdf(pdf, pagesRef.current, s, paint);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [url, scale, paint]);

  // ?note=<id> → scroll to that note
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('note');
    if (!id) return;
    const t = setInterval(() => scrollToHighlight(id) && clearInterval(t), 700);
    setTimeout(() => clearInterval(t), 15000);
    return () => clearInterval(t);
  }, []);

  // selection → "Add note" button; click on highlight → open note
  useEffect(() => {
    const root = pagesRef.current!;
    const check = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setSelBtn(null);
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return setSelBtn(null);
      const text = sel.toString().trim();
      if (!text) return setSelBtn(null);
      const { anchor, before, after } = anchorFromRange(root, range);
      const rects = range.getClientRects();
      const r = rects[rects.length - 1] ?? range.getBoundingClientRect();
      const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const page = Number(startEl?.closest('[data-page-number]')?.getAttribute('data-page-number')) || null;
      setSelBtn({
        x: Math.min(r.right, window.innerWidth - 130),
        y: Math.min(r.bottom + 8, window.innerHeight - 50),
        draft: {
          title: text,
          anchor,
          context_sentence: sentence(before, anchor.exact, after),
          source_type: 'pdf_local',
          source_url: `local-pdf://${file.file_name}`,
          page_title: file.file_name,
          pdf_fingerprint: file.fingerprint,
          pdf_page_number: page,
        },
      });
    };
    let t = 0;
    const onSel = () => {
      clearTimeout(t);
      t = window.setTimeout(check, 250);
    };
    const onClick = (e: MouseEvent) => {
      const hl = (e.target as Element).closest?.(HL_TAG) as HTMLElement | null;
      if (!hl || window.getSelection()?.toString()) return;
      const n = notesRef.current.find((x) => x.id === hl.dataset.note);
      if (n) setOpen(n);
    };
    document.addEventListener('selectionchange', onSel);
    root.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      root.removeEventListener('click', onClick);
    };
  }, [file]);

  const onSaved = (n: Note, created: { folder?: Folder; tags: Tag[] }) => {
    const exists = notes.some((x) => x.id === n.id);
    const next = exists ? notes.map((x) => (x.id === n.id ? n : x)) : [...notes, n];
    notesRef.current = next;
    setNotes(next);
    if (created.folder) setFolders([...folders, created.folder]);
    if (created.tags.length) setTags([...tags, ...created.tags]);
    setDraft(null);
    setOpen(null);
    window.getSelection()?.removeAllRanges();
    // repaint (colour may have changed)
    document.querySelectorAll(`${HL_TAG}[data-note="${n.id}"]`).forEach((el) => el.replaceWith(...el.childNodes));
    paint();
  };

  return (
    <div className="min-h-screen bg-[#ece6e7]">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b-4 border-brand bg-white px-3 py-2">
        <Link href="/pdfs" className="rounded px-2 py-1 text-sm hover:bg-paper">
          ← Library
        </Link>
        <span className="min-w-0 flex-1 truncate font-bold">{file.file_name}</span>
        <span className="hidden text-sm text-muted sm:inline">{pages} pages</span>
        <button onClick={() => setScale((s) => Math.max(0.4, s / 1.2))} className="rounded border border-line px-2">
          −
        </button>
        <span className="w-12 text-center text-sm text-muted">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, s * 1.2))} className="rounded border border-line px-2">
          +
        </button>
        <button onClick={() => setListOpen(!listOpen)} className="rounded bg-brand px-3 py-1 text-sm font-semibold text-white">
          Notes ({notes.length})
        </button>
      </div>

      {error && <p className="m-6 rounded-lg bg-red-50 p-3 text-red-800">Could not open the PDF: {error}</p>}
      <div ref={pagesRef} className="overflow-x-auto px-2 py-4" />

      {selBtn && !draft && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft(selBtn.draft);
            setSelBtn(null);
          }}
          className="fixed z-40 flex items-center gap-1 rounded-full border-2 border-white bg-brand py-1 pl-1 pr-3 text-sm font-semibold text-white shadow-lg"
          style={{ left: selBtn.x, top: selBtn.y }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-6 w-6 rounded-full" /> Add note
        </button>
      )}

      {listOpen && (
        <aside className="fixed bottom-0 right-0 top-14 z-30 w-full max-w-sm overflow-y-auto border-l border-line bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Notes on this PDF</h2>
            <button onClick={() => setListOpen(false)} className="text-2xl leading-none text-muted">
              ×
            </button>
          </div>
          {notes.length === 0 && <p className="text-sm text-muted">Select text in the PDF and tap “Add note”.</p>}
          <div className="space-y-2">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!scrollToHighlight(n.id)) setOpen(n);
                  if (window.innerWidth < 640) setListOpen(false);
                }}
                className="note-block block w-full rounded-lg p-3 text-left"
                style={{ background: noteBlockColor(n.highlight_color) }}
              >
                <p className="font-title line-clamp-2 text-lg">{n.title}</p>
                {n.body_text && <p className="line-clamp-3 text-sm text-[#4d4446]">{n.body_text}</p>}
                {n.pdf_page_number && <p className="mt-1 text-xs text-muted">Page {n.pdf_page_number}</p>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {(draft || open) && (
        <NoteModal
          note={open ?? undefined}
          draft={draft ?? undefined}
          folders={folders}
          tags={tags}
          profile={profile}
          onClose={() => {
            setDraft(null);
            setOpen(null);
          }}
          onSaved={onSaved}
          onDeleted={(id) => {
            document.querySelectorAll(`${HL_TAG}[data-note="${id}"]`).forEach((el) => el.replaceWith(...el.childNodes));
            const next = notes.filter((x) => x.id !== id);
            notesRef.current = next;
            setNotes(next);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
