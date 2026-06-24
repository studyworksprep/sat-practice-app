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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { uploadFigure } from '@/lib/content/upload-figure-client';
import { MathField } from '../../questions/new/MathField';
import { MathInline, MathBlock, MathPopoverBridge } from './lesson-math-extensions';

type Popover = { pos: number | null; latex: string; display: boolean };

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

  // Math popover state: pos === null means "insert new"; a number means
  // "edit the existing node at this document position". draftLatex holds
  // the in-progress MathLive value so confirming reads the latest edit.
  const [popover, setPopover] = useState<Popover | null>(null);
  const draftLatex = useRef('');
  // Held in a ref so the node views (rendered out-of-tree) can reach the
  // current "open popover" callback without re-creating the editor.
  const openPopoverRef = useRef<((p: Popover) => void) | null>(null);
  const getApi = useCallback(() => openPopoverRef.current, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      MathInline,
      MathBlock,
      // getApi is inferred as () => null from the JS extension's default
      // option; cast to satisfy the option type while returning the live
      // popover-opener at runtime.
      MathPopoverBridge.configure({ getApi: getApi as unknown as () => null }),
    ],
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

  // Keep the popover-opener fresh for the math node views to call.
  useEffect(() => {
    openPopoverRef.current = ({ pos, latex, display }: Popover) => {
      draftLatex.current = latex || '';
      setPopover({ pos, latex: latex || '', display: !!display });
    };
  });

  if (!editor) {
    return <div style={S.shell} />;
  }

  function openInsertMath(display: boolean) {
    draftLatex.current = '';
    setPopover({ pos: null, latex: '', display });
  }

  function confirmMath() {
    if (!editor) return;
    const latex = draftLatex.current.trim();
    if (!latex) {
      setPopover(null);
      return;
    }
    if (popover?.pos == null) {
      editor
        .chain()
        .focus()
        .insertContent({ type: popover?.display ? 'mathBlock' : 'mathInline', attrs: { latex } })
        .run();
    } else {
      const pos = popover.pos;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeAttribute(pos, 'latex', latex);
          return true;
        })
        .run();
    }
    setPopover(null);
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
        <button type="button" style={S.btn} title="Insert inline equation" onClick={() => openInsertMath(false)}>
          √x
        </button>
        <button type="button" style={S.btn} title="Insert display equation" onClick={() => openInsertMath(true)}>
          √x⏎
        </button>
        <span style={S.sep} />
        <button type="button" style={S.btn} title="Upload image" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? '…' : '🖼'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
      </div>

      {popover ? (
        <div style={S.popover}>
          <span style={S.popoverLabel}>
            {popover.pos == null ? 'Insert' : 'Edit'} {popover.display ? 'display' : 'inline'} equation
          </span>
          <MathField
            value={popover.latex}
            onChange={(v: string) => {
              draftLatex.current = v;
            }}
            onEnter={confirmMath}
          />
          <div style={S.popoverBtns}>
            <button type="button" style={{ ...S.btn, ...S.btnPrimary }} onClick={confirmMath}>
              {popover.pos == null ? 'Insert' : 'Update'}
            </button>
            <button type="button" style={S.btn} onClick={() => setPopover(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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
  btnPrimary: {
    background: 'var(--color-app-accent, #4f7ce0)',
    borderColor: 'var(--color-app-accent, #4f7ce0)',
    color: '#fff',
  },
  err: { color: 'var(--color-danger)', fontSize: 12, padding: '4px 10px' },
  popover: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    borderBottom: '1px solid var(--border)',
    background: 'var(--color-app-accent-bg, #eef)',
  },
  popoverLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-navy-900)',
  },
  popoverBtns: { display: 'flex', gap: 8 },
};
