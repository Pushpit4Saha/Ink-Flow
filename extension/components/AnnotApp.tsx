import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { captureSelection, type CapturedSelection } from '../lib/selection';
import { sendToBg } from '../lib/messaging';
import { applyHighlights, HL_TAG, scrollToHighlight } from '../lib/highlighter';
import { APP_NAME, DASHBOARD_URL } from '../lib/config';
import { DEFAULT_SETTINGS, noteBlockColor, type Note, type Settings, type TabMessage } from '../lib/types';
import { fontVars, injectFontFaces } from '../lib/fonts';
import type { PageSource } from '../lib/source';
import NoteEditor, { NOTE_W } from './NoteEditor';
import logoUrl from '../assets/logo.png?inline';

interface OpenNote {
  sel: CapturedSelection;
  x: number;
  y: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function niceDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AnnotApp({ host, source }: { host: HTMLElement; source: PageSource }) {
  const [sel, setSel] = useState<CapturedSelection | null>(null);
  const [editing, setEditing] = useState<OpenNote | null>(null);
  const [viewing, setViewing] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [pageNotes, setPageNotes] = useState<Note[]>([]);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fabHidden, setFabHidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pdfBanner, setPdfBanner] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const notesRef = useRef<Note[]>([]);
  notesRef.current = pageNotes;

  // fonts chosen in Settings (title font + text font)
  useEffect(() => {
    injectFontFaces();
    browser.storage.local.get('settingsCache').then((r) => r.settingsCache && setSettings(r.settingsCache as Settings));
    const onChange = (c: Record<string, { newValue?: unknown }>) => c.settingsCache?.newValue && setSettings(c.settingsCache.newValue as Settings);
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 2800);
  };

  // ---- paint highlights for the notes we know about ----
  const paint = useCallback(() => {
    const o = applyHighlights(source.root(), notesRef.current);
    setOrphans(o);
    return o;
  }, [source]);

  // ---- notes for this page / PDF ----
  const loadPageNotes = useCallback(async () => {
    const fp = source.fingerprint();
    const r = await sendToBg<Note[]>(fp ? { type: 'GET_NOTES', fingerprint: fp } : { type: 'GET_NOTES', url: source.url() });
    if (!r.ok) return;
    notesRef.current = r.data;
    setPageNotes(r.data);
    paint();
    // opened from the dashboard with "#annot-note=<id>" → scroll to it
    const m = location.hash.match(/annot-note=([\w-]+)/);
    if (m) window.setTimeout(() => scrollToHighlight(m[1]), 300);
  }, [source, paint]);

  useEffect(() => {
    loadPageNotes();
    if (source.kind !== 'page') return;
    // single-page apps change URL without reloading — reload notes when it changes
    let last = location.href.split('#')[0];
    const t = window.setInterval(() => {
      const now = location.href.split('#')[0];
      if (now !== last) {
        last = now;
        loadPageNotes();
      }
    }, 1500);
    return () => window.clearInterval(t);
  }, [loadPageNotes, source]);

  // pages that load content later: try again when the page changes (a limited number of times)
  useEffect(() => {
    if (orphans.length === 0) return;
    let tries = 0;
    let timer = 0;
    const obs = new MutationObserver((muts) => {
      if (muts.every((m) => [...m.addedNodes].every((n) => (n as Element).tagName?.toLowerCase() === HL_TAG))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        tries++;
        obs.disconnect();
        const left = paint();
        if (left.length && tries < 15) obs.observe(source.root(), { childList: true, subtree: true });
      }, 900);
    });
    obs.observe(source.root(), { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
    };
  }, [orphans.length, paint, source]);

  // our PDF viewer tells us when a new page's text is ready
  useEffect(() => {
    const onRefresh = () => paint();
    window.addEventListener('annot:refresh', onRefresh);
    return () => window.removeEventListener('annot:refresh', onRefresh);
  }, [paint]);

  // ---- floating button hidden on this site? ----
  useEffect(() => {
    if (source.kind !== 'page') return;
    browser.storage.local.get(['disabledSites', 'autoPdf']).then((r) => {
      const list = (r.disabledSites as string[] | undefined) ?? [];
      setFabHidden(list.includes(location.hostname));
      // Chrome/Edge built-in PDF viewer doesn't allow notes → offer our viewer
      if (document.contentType === 'application/pdf') {
        if (r.autoPdf) sendToBg({ type: 'OPEN_PDF_VIEWER', url: location.href });
        else setPdfBanner(true);
      }
    });
    const onChange = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.disabledSites) {
        const list = (changes.disabledSites.newValue as string[] | undefined) ?? [];
        setFabHidden(list.includes(location.hostname));
      }
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, [source]);

  // ---- open the sticky note editor for a selection ----
  const openEditor = useCallback((s: CapturedSelection) => {
    const x = clamp(s.rect.left, 12, window.innerWidth - NOTE_W - 12);
    const y = clamp(s.rect.bottom + 10, 12, Math.max(12, window.innerHeight - 460));
    setEditing({ sel: s, x, y });
    setViewing(null);
    setSel(null);
  }, []);

  // ---- watch for text selection and clicks on highlights ----
  useEffect(() => {
    const insideUs = (e: Event) => e.composedPath().includes(host);

    const onMouseUp = (e: MouseEvent) => {
      if (insideUs(e)) return;
      window.setTimeout(() => setSel(captureSelection(source.root())), 10);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!insideUs(e)) setSel(null);
    };
    const onClick = (e: MouseEvent) => {
      if (insideUs(e)) return;
      const hl = (e.target as Element | null)?.closest?.(HL_TAG) as HTMLElement | null;
      if (!hl || window.getSelection()?.toString()) return;
      const note = notesRef.current.find((n) => n.id === hl.dataset.note);
      if (note) {
        setViewing({ note, x: clamp(e.clientX - 40, 8, window.innerWidth - 330), y: clamp(e.clientY + 14, 8, window.innerHeight - 260) });
      }
    };
    const onScroll = () => setSel(null);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey && !insideUs(e)) setSel(captureSelection(source.root()));
    };
    // touch screens: selection changes without mouseup
    let selTimer = 0;
    const onSelChange = () => {
      window.clearTimeout(selTimer);
      selTimer = window.setTimeout(() => {
        if (matchMedia('(pointer: coarse)').matches) setSel(captureSelection(source.root()));
      }, 400);
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelChange);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [host, source]);

  // ---- keyboard shortcut from background (Ctrl/Cmd+Shift+Y) ----
  useEffect(() => {
    const listener = (msg: unknown) => {
      if ((msg as TabMessage)?.type === 'OPEN_NOTE_FOR_SELECTION') {
        const s = captureSelection(source.root());
        if (s) openEditor(s);
        else showToast('Select some text first');
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [openEditor, source]);

  const hideFabOnSite = async () => {
    const r = await browser.storage.local.get('disabledSites');
    const list = new Set((r.disabledSites as string[] | undefined) ?? []);
    list.add(location.hostname);
    await browser.storage.local.set({ disabledSites: [...list] });
    setPanelOpen(false);
    showToast('Button hidden on this site. Turn it back on from the extension icon.');
  };

  // our own website already shows notes — stay out of the way there
  if (source.kind === 'page' && location.origin === new URL(DASHBOARD_URL).origin) return null;

  const orphanNotes = pageNotes.filter((n) => orphans.includes(n.id));
  const foundNotes = pageNotes.filter((n) => !orphans.includes(n.id));

  return (
    <div className="annot-root" style={fontVars(settings.title_font, settings.body_font) as React.CSSProperties}>
      {pdfBanner && (
        <div className="annot-pdf-banner">
          <img src={logoUrl} alt="" />
          <span>Want to add notes to this PDF?</span>
          <button className="annot-btn" onClick={() => sendToBg({ type: 'OPEN_PDF_VIEWER', url: location.href })}>
            Open in <span className="annot-name">{APP_NAME}</span>
          </button>
          <button
            className="annot-link"
            onClick={() => {
              browser.storage.local.set({ autoPdf: true });
              sendToBg({ type: 'OPEN_PDF_VIEWER', url: location.href });
            }}
          >
            Always
          </button>
          <button className="annot-x" onClick={() => setPdfBanner(false)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      {/* small button next to the selection */}
      {sel && !editing && (
        <button
          className="annot-sel-btn"
          style={{
            left: clamp(sel.rect.right - 14, 4, window.innerWidth - 40),
            top: clamp(sel.rect.bottom + 6, 4, window.innerHeight - 40),
          }}
          title="Add a sticky note"
          onMouseDown={(e) => e.preventDefault() /* keep the page selection */}
          onClick={() => openEditor(sel)}
        >
          <img src={logoUrl} alt="Add note" />
        </button>
      )}

      {editing && (
        <NoteEditor
          key={editing.sel.text + editing.x}
          sel={editing.sel}
          x={editing.x}
          y={editing.y}
          source={source}
          onClose={() => setEditing(null)}
          onSaved={(n, queued) => {
            setEditing(null);
            window.getSelection()?.removeAllRanges();
            if (n) {
              notesRef.current = [n, ...notesRef.current];
              setPageNotes(notesRef.current);
              paint();
              showToast('Note saved ✓');
            } else if (queued) showToast('You are offline — note saved and will sync later');
          }}
          onError={showToast}
        />
      )}

      {viewing && (
        <div
          className="annot-view"
          style={{ left: viewing.x, top: viewing.y, background: noteBlockColor(viewing.note.highlight_color) }}
        >
          <div className="annot-view-head">
            <strong>{viewing.note.title}</strong>
            <button className="annot-x" onClick={() => setViewing(null)} aria-label="Close">
              ×
            </button>
          </div>
          {viewing.note.body_text && <div className="annot-view-body">{viewing.note.body_text}</div>}
          {viewing.note.images.length > 0 && (
            <div className="annot-thumbs">
              {viewing.note.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="annot-thumb">
                  <img src={src} alt="" />
                </a>
              ))}
            </div>
          )}
          {viewing.note.tags.length > 0 && (
            <div className="annot-tags">
              {viewing.note.tags.map((t) => (
                <span key={t} className="annot-chip">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="annot-view-foot">
            <span className="annot-muted annot-small">{niceDate(viewing.note.created_at)}</span>
            <button className="annot-link" onClick={() => sendToBg({ type: 'OPEN_DASHBOARD', path: `/dashboard?note=${viewing.note.id}` })}>
              Edit in dashboard
            </button>
          </div>
        </div>
      )}

      {/* floating round button (like Grammarly) */}
      {!fabHidden && (
        <button className="annot-fab" title={`${APP_NAME}: notes on this page`} onClick={() => setPanelOpen((v) => !v)}>
          <img src={logoUrl} alt={APP_NAME} />
          {pageNotes.length > 0 && <span className="annot-badge">{pageNotes.length}</span>}
        </button>
      )}

      {panelOpen && !fabHidden && (
        <div className="annot-panel">
          <div className="annot-panel-head">
            <strong>Notes on this {source.kind === 'pdf' ? 'PDF' : 'page'}</strong>
            <button className="annot-x" onClick={() => setPanelOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="annot-panel-list">
            {pageNotes.length === 0 && (
              <p className="annot-muted">No notes yet. Select any text and click the flower button.</p>
            )}
            {foundNotes.map((n) => (
              <button
                key={n.id}
                className="annot-mini"
                style={{ background: noteBlockColor(n.highlight_color) }}
                onClick={() => scrollToHighlight(n.id)}
              >
                <div className="annot-mini-title">{n.title}</div>
                {n.body_text && <div className="annot-mini-body">{n.body_text}</div>}
              </button>
            ))}
            {orphanNotes.length > 0 && (
              <>
                <p className="annot-muted annot-small annot-orphan-label">
                  Couldn’t find these on the page (the text may have changed):
                </p>
                {orphanNotes.map((n) => (
                  <div key={n.id} className="annot-mini annot-orphan">
                    <div className="annot-mini-title">{n.title}</div>
                    {n.body_text && <div className="annot-mini-body">{n.body_text}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="annot-panel-foot">
            <button className="annot-link" onClick={() => sendToBg({ type: 'OPEN_DASHBOARD' })}>
              Open dashboard
            </button>
            {source.kind === 'page' && (
              <button className="annot-link annot-muted" onClick={hideFabOnSite}>
                Hide on this site
              </button>
            )}
          </div>
        </div>
      )}

      {toast && <div className="annot-toast">{toast}</div>}
    </div>
  );
}
