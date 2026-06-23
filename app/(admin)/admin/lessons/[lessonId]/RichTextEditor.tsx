// Rich text + image editor for lesson `text` blocks.
//
// Unlike the question-bank RichEditor (which emits ProseMirror JSON
// for the bank serializer), lesson text blocks store HTML in
// content.html — that's what lib/ui/LessonSlideshow renders and what
// SafeHtml sanitizes on the way out. So this editor is HTML-in /
// HTML-out: it seeds from `html` and reports editor.getHTML() on every
// change.
//
// Images upload to the shared question-figures bucket via uploadFigure
// and are inserted as <img src>. The lesson sanitizer (question
// profile) already allows p / headings / lists / strong / em / a / img,
// so this output round-trips cleanly.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { uploadFigure } from '@/lib/content/upload-figure-client';

export function RichTextEditor({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const [, setTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: false })],
    content: html || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        style:
          'min-height:120px;outline:none;padding:10px;font-size:15px;line-height:1.6;',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Re-render the toolbar on each transaction so active states stay in
  // sync with the selection.
  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setTick((t) => t + 1);
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [editor]);

  if (!editor) {
    return <div style={S.shell} />;
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setUploadErr(null);
    setUploading(true);
    try {
      const url = await uploadFigure(file);
      editor.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: '' } }).run();
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={S.shell}>
      <div style={S.toolbar}>
        <Tool ed={editor} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <b>B</b>
        </Tool>
        <Tool ed={editor} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <i>i</i>
        </Tool>
        <span style={S.sep} />
        <Tool ed={editor} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">
          H
        </Tool>
        <Tool ed={editor} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          • —
        </Tool>
        <Tool ed={editor} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          1.
        </Tool>
        <Tool ed={editor} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          ❝
        </Tool>
        <span style={S.sep} />
        <button type="button" style={S.btn} title="Upload image" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? '…' : '🖼'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
      </div>

      <EditorContent editor={editor} />
      {uploadErr ? <div style={S.err}>Image upload failed: {uploadErr}</div> : null}
    </div>
  );
}

function Tool({
  ed,
  active,
  onClick,
  title,
  children,
}: {
  ed: Editor;
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // ed is accepted so the button re-renders with the parent's tick.
  void ed;
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active || undefined}
      onClick={onClick}
      style={{ ...S.btn, ...(active ? S.btnActive : null) }}
    >
      {children}
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-white, var(--card))',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderBottom: '1px solid var(--border)',
    background: 'var(--card)',
    flexWrap: 'wrap',
  },
  sep: { width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 2px' },
  btn: {
    minWidth: 28,
    height: 28,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-white, var(--card))',
    color: 'var(--fg1)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  btnActive: { background: 'var(--color-app-accent-bg, #eef)', borderColor: 'var(--color-app-accent)', color: 'var(--color-app-accent)' },
  err: { color: 'var(--color-danger)', fontSize: 12, padding: '4px 10px' },
};
