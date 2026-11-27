'use client';
import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';

/** Rich text box (bold, italic, lists, quotes) used for note bodies. */
export default function RichEditor({
  initial,
  onReady,
  placeholder = 'Write anything — meaning, explanation, your thoughts…',
}: {
  initial: JSONContent | string | null;
  onReady: (e: Editor) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: initial ?? '',
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  const btn = 'rounded px-2 py-0.5 text-sm text-muted hover:bg-black/5 hover:text-ink';
  return (
    <div className="pm-editor">
      {editor && (
        <div className="mb-1 flex items-center gap-1 border-b border-black/10 pb-1">
          <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </button>
          <button type="button" className={btn} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </button>
          <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            • List
          </button>
          <button type="button" className={btn} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            1. List
          </button>
          <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            ❝
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
