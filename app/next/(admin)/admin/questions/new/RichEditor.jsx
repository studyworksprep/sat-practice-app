'use client';

// WYSIWYG editor for one question surface. Rich text (bold / italic),
// visual math (inline + display, entered through the MathLive
// popover), tables, and figure uploads — all constrained to the
// node/mark set the bank serializer (lib/content/bank-html.ts) knows
// how to emit, so whatever the admin builds round-trips to clean,
// consistent bank HTML.
//
// The editor is uncontrolled: it initializes from `initialContent`
// (ProseMirror JSON) and reports every change via onChange(json).
// The parent serializes that JSON server-side on submit.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Image } from '@tiptap/extension-image';
import { MathInline, MathBlock, MathPopoverBridge } from './math-extensions';
import { MathField } from './MathField';
import { uploadFigure } from '@/lib/content/upload-figure-client';
import s from './author.module.css';

// StarterKit minus every block node the serializer doesn't emit, so
// an admin can't create content (headings, lists, blockquotes, …)
// that would be silently dropped on save.
const STARTER_KIT_OPTS = {
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  blockquote: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
  code: false,
  link: false,
  underline: false,
};

export function RichEditor({
  initialContent,
  onChange,
  tools = {},
  placeholder,
  minHeight = '3rem',
}) {
  const { tables = false, images = false, displayMath = true } = tools;
  const [, setTick] = useState(0);
  // Popover state: { pos|null, latex, display }. pos === null means
  // "insert new"; a number means "edit the node at this position".
  const [popover, setPopover] = useState(null);
  const draftLatex = useRef('');
  const fileInputRef = useRef(null);
  const [uploadErr, setUploadErr] = useState(null);
  // Holds the current "open popover" callback so the math node views
  // can reach it through the editor without mutating editor.storage.
  // getApi is stable and only reads the ref when invoked (from a node
  // view click handler), never during render.
  const openPopoverRef = useRef(null);
  const getApi = useCallback(() => openPopoverRef.current, []);

  const extensions = [
    StarterKit.configure(STARTER_KIT_OPTS),
    MathInline,
    // MathBlock is always registered so a display equation in loaded /
    // pre-filled content is never dropped on parse; the toolbar's insert
    // button is what `displayMath` gates.
    MathBlock,
    // getApi only reads the ref when a math node view is clicked, never
    // during render. TipTap mounts node views in a separate React root,
    // so a ref bridge (not context) is the way to reach them.
    // eslint-disable-next-line react-hooks/refs
    MathPopoverBridge.configure({ getApi }),
  ];
  if (tables) {
    extensions.push(TableKit.configure({ table: { resizable: false } }));
  }
  if (images) extensions.push(Image.configure({ inline: false }));

  const editor = useEditor({
    extensions,
    content: initialContent ?? null,
    immediatelyRender: false,
    editorProps: { attributes: { class: s.prose } },
    onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
  });

  // Re-render the toolbar on every transaction so active states and
  // table-context buttons stay in sync.
  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setTick((t) => t + 1);
    editor.on('transaction', bump);
    return () => { editor.off('transaction', bump); };
  }, [editor]);

  // Keep the popover-opener fresh for the math node views to call.
  useEffect(() => {
    openPopoverRef.current = ({ pos, latex, display }) => {
      draftLatex.current = latex || '';
      setPopover({ pos, latex: latex || '', display: !!display });
    };
  });

  // Emit the initial parsed document once so the parent holds JSON for
  // pre-filled (e.g. AI-generated) content even before the admin edits.
  const emittedInitial = useRef(false);
  useEffect(() => {
    if (!editor || emittedInitial.current) return;
    emittedInitial.current = true;
    onChange?.(editor.getJSON());
  }, [editor, onChange]);

  if (!editor) {
    return <div className={s.editorShell} style={{ minHeight }} />;
  }

  function openInsert(display) {
    draftLatex.current = '';
    setPopover({ pos: null, latex: '', display });
  }

  function confirmMath() {
    const latex = draftLatex.current.trim();
    if (!latex) { setPopover(null); return; }
    if (popover.pos == null) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: popover.display ? 'mathBlock' : 'mathInline',
          attrs: { latex },
        })
        .run();
    } else {
      const pos = popover.pos;
      editor.chain().focus().command(({ tr }) => {
        tr.setNodeAttribute(pos, 'latex', latex);
        return true;
      }).run();
    }
    setPopover(null);
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadErr(null);
    try {
      const url = await uploadFigure(file);
      editor.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: '' } }).run();
    } catch (err) {
      setUploadErr(err.message || String(err));
    }
  }

  const inTable = editor.isActive('table');

  return (
    <div className={s.editorShell}>
      <div className={s.toolbar}>
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" title="Bold" bold />
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="i" title="Italic" italic />
        <span className={s.sep} />
        <ToolBtn onClick={() => openInsert(false)} label="√x" title="Insert inline equation" />
        {displayMath && (
          <ToolBtn onClick={() => openInsert(true)} label="√x⏎" title="Insert display equation" />
        )}
        {tables && (
          <>
            <span className={s.sep} />
            <ToolBtn
              onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
              label="⊞" title="Insert table"
            />
            {inTable && (
              <>
                <ToolBtn onClick={() => editor.chain().focus().addColumnAfter().run()} label="+col" title="Add column" />
                <ToolBtn onClick={() => editor.chain().focus().addRowAfter().run()} label="+row" title="Add row" />
                <ToolBtn onClick={() => editor.chain().focus().deleteColumn().run()} label="−col" title="Delete column" />
                <ToolBtn onClick={() => editor.chain().focus().deleteRow().run()} label="−row" title="Delete row" />
                <ToolBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} label="H" title="Toggle header row" />
                <ToolBtn onClick={() => editor.chain().focus().deleteTable().run()} label="⌫⊞" title="Delete table" />
              </>
            )}
          </>
        )}
        {images && (
          <>
            <span className={s.sep} />
            <ToolBtn onClick={() => fileInputRef.current?.click()} label="🖼" title="Upload figure" />
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} hidden />
          </>
        )}
      </div>

      {popover && (
        <div className={s.popover}>
          <span className={s.popoverLabel}>
            {popover.pos == null ? 'Insert' : 'Edit'} {popover.display ? 'display' : 'inline'} equation
          </span>
          <MathField
            value={popover.latex}
            onChange={(v) => { draftLatex.current = v; }}
            onEnter={confirmMath}
          />
          <div className={s.popoverBtns}>
            <button type="button" className={s.primaryBtn} onClick={confirmMath}>
              {popover.pos == null ? 'Insert' : 'Update'}
            </button>
            <button type="button" className={s.ghostBtn} onClick={() => setPopover(null)}>Cancel</button>
          </div>
        </div>
      )}

      <EditorContent editor={editor} />
      {placeholder && editor.isEmpty && <div className={s.placeholder}>{placeholder}</div>}
      {uploadErr && <div className={s.uploadErr}>{uploadErr}</div>}
    </div>
  );
}

function ToolBtn({ active, onClick, label, title, bold, italic }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active || undefined}
      className={`${s.toolBtn} ${active ? s.toolBtnActive : ''}`}
      style={{ fontWeight: bold ? 700 : undefined, fontStyle: italic ? 'italic' : undefined }}
    >
      {label}
    </button>
  );
}
