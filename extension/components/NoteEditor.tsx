import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { sendToBg } from '../lib/messaging';
import { fileToDataUrl, type CapturedSelection } from '../lib/selection';
import type { PageSource } from '../lib/source';
import { COLORS, noteBlockColor, type Meta, type NewNote, type Note } from '../lib/types';

export const NOTE_W = 360;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function NoteEditor({
  sel,
  x,
  y,
  source,
  onClose,
  onSaved,
  onError,
}: {
  sel: CapturedSelection;
  x: number;
  y: number;
  source: PageSource;
  onClose: () => void;
  onSaved: (n: Note | null, queued: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [title, setTitle] = useState(sel.text);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [color, setColor] = useState(COLORS[0].hex);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ x, y });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const suggRef = useRef<string | null>(null);

  const addFiles = async (files: Iterable<File>) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const url = await fileToDataUrl(f);
        setImages((imgs) => [...imgs, url].slice(0, 6));
      } catch {
        onError('Could not read that image');
      }
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
      Placeholder.configure({
        placeholder: () => (suggRef.current ? `${suggRef.current}` : 'Write anything — meaning, explanation, your thoughts…'),
      }),
    ],
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'annot-pm' },
      handleKeyDown(view, event) {
        // Copilot-style: Tab accepts the grey AI suggestion
        if (event.key === 'Tab' && suggRef.current && view.state.doc.textContent.length === 0) {
          view.dispatch(view.state.tr.insertText(suggRef.current));
          suggRef.current = null;
          setSuggestion(null);
          return true;
        }
        return false;
      },
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        addFiles(files);
        return true;
      },
      handleDrop(_view, event) {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        addFiles(files);
        return true;
      },
    },
  });

  // load folders, tags and settings; then ask AI for a suggestion
  useEffect(() => {
    sendToBg<Meta>({ type: 'GET_META' }).then((r) => {
      if (!r.ok) {
        if (r.error === 'NOT_LOGGED_IN') setNeedLogin(true);
        return;
      }
      setMeta(r.data);
      setColor(r.data.settings.highlight_color || COLORS[0].hex);
      if (r.data.settings.ai_enabled) {
        setThinking(true);
        sendToBg<string | null>({ type: 'SUGGEST', text: sel.text, context: sel.context, title: source.title() }).then((s) => {
          setThinking(false);
          if (s.ok && s.data) {
            suggRef.current = s.data;
            setSuggestion(s.data);
          }
        });
      }
    });
  }, [sel, source]);

  // redraw the placeholder when the suggestion arrives
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('annot-sugg', suggestion));
  }, [editor, suggestion]);

  // drag the note by its header
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      setPos({
        x: clamp(e.clientX - drag.current.dx, 0, window.innerWidth - 80),
        y: clamp(e.clientY - drag.current.dy, 0, window.innerHeight - 40),
      });
    };
    const up = () => (drag.current = null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const addTag = (t: string) => {
    const v = t.trim().replace(/^#/, '');
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const acceptSuggestion = () => {
    if (!editor || !suggRef.current) return;
    editor.chain().focus().insertContent(suggRef.current).run();
    suggRef.current = null;
    setSuggestion(null);
  };

  const save = async () => {
    if (!title.trim() || !editor) return;
    if (tagInput.trim()) addTag(tagInput);
    setSaving(true);
    const allTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags;
    const note: NewNote = {
      title: title.trim(),
      body_text: editor.getText().trim(),
      body_json: editor.isEmpty ? null : editor.getJSON(),
      source_type: source.sourceType(),
      source_url: source.url(),
      page_title: source.title(),
      favicon_url: source.favicon(),
      context_sentence: sel.context || null,
      anchor: sel.anchor,
      highlight_color: color,
      folder_id: folderId && folderId !== '__new' ? folderId : null,
      pdf_fingerprint: source.fingerprint(),
      pdf_page_number: sel.pageNumber,
    };
    const r = await sendToBg<Note | { queued: true }>({
      type: 'SAVE_NOTE',
      payload: { note, tags: allTags, images, newFolderName: folderId === '__new' ? newFolder : null },
    });
    setSaving(false);
    if (r.ok) {
      if ('queued' in r.data) onSaved(null, true);
      else onSaved(r.data, false);
    } else if (r.error === 'NOT_LOGGED_IN') setNeedLogin(true);
    else onError('Could not save: ' + r.error);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  };

  const tagMatches =
    tagInput.trim() && meta
      ? meta.tags.filter((t) => t.name.toLowerCase().includes(tagInput.trim().toLowerCase()) && !tags.includes(t.name)).slice(0, 5)
      : [];

  return (
    <div
      className="annot-note"
      style={{ left: pos.x, top: pos.y, width: NOTE_W, background: noteBlockColor(color) }}
      onKeyDown={onKey}
    >
      <div
        className="annot-note-head"
        onMouseDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
      >
        <span className="annot-note-label">Sticky note</span>
        <div className="annot-colors">
          {COLORS.map((c) => (
            <button
              key={c.hex}
              title={c.name}
              className={`annot-dot ${color === c.hex ? 'on' : ''}`}
              style={{ background: c.hex }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setColor(c.hex)}
            />
          ))}
        </div>
        <button className="annot-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <textarea
        className="annot-note-title"
        value={title}
        rows={Math.min(3, Math.ceil(title.length / 40) || 1)}
        onChange={(e) => setTitle(e.target.value)}
      />

      {editor && (
        <div className="annot-toolbar">
          <button title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </button>
          <button title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </button>
          <button title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            •≡
          </button>
          <button title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            1.
          </button>
          <button title="Add photo" onClick={() => fileRef.current?.click()}>
            📷
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <span className="annot-ai-state">
            {thinking && '✨ thinking…'}
            {suggestion && (
              <button className="annot-ai-accept" onClick={acceptSuggestion} title="Use the AI suggestion">
                ✨ Tab to use
              </button>
            )}
          </span>
        </div>
      )}

      <EditorContent editor={editor} className="annot-editor" />

      {images.length > 0 && (
        <div className="annot-thumbs">
          {images.map((src, i) => (
            <div key={i} className="annot-thumb">
              <img src={src} alt="" />
              <button onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remove photo">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="annot-row">
        <div className="annot-tags">
          {tags.map((t) => (
            <span key={t} className="annot-chip">
              #{t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
            </span>
          ))}
          <input
            className="annot-tag-input"
            placeholder={tags.length ? '' : '+ tags'}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
            }}
          />
        </div>
        {tagMatches.length > 0 && (
          <div className="annot-tag-sugg">
            {tagMatches.map((t) => (
              <button key={t.id} onClick={() => addTag(t.name)}>
                #{t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="annot-row annot-folder-row">
        <span>📁</span>
        <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">No folder</option>
          {meta?.folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          <option value="__new">+ New folder…</option>
        </select>
        {folderId === '__new' && (
          <input
            className="annot-folder-input"
            placeholder="Folder name"
            autoFocus
            value={newFolder ?? ''}
            onChange={(e) => setNewFolder(e.target.value)}
          />
        )}
      </div>

      {needLogin && (
        <div className="annot-login-hint">
          Please log in first: click the extension icon in your browser toolbar, log in, then press Save again.
        </div>
      )}

      <div className="annot-note-actions">
        <span className="annot-muted annot-small">Ctrl+Enter to save</span>
        <button className="annot-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="annot-btn" onClick={save} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
