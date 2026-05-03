// Rich-text + math editor for the student notes feature.
//
// Wraps a TipTap editor (StarterKit + the custom MathExtension). The
// editor itself handles formatting (bold, italic, headings, lists,
// code, links inherited from StarterKit); the toolbar above adds an
// "Insert math" button that drops in an empty math node and focuses
// it, plus the title input and a Save button wired to the parent's
// onSave callback.
//
// `editable=false` mounts the same component in read-only mode for
// the per-note view page so the same render path produces identical
// output to what the editor draws.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { MathExtension } from './MathNode';
import { ExcalidrawExtension, insertExcalidraw } from './ExcalidrawNode';
import { docToPlainText, EMPTY_DOC } from '@/lib/notes/render';
import { syncMathNodesFromDom } from '@/lib/notes/sync-math-nodes';
import type { NoteDoc, NoteTaxonomy } from '@/lib/types';
import {
  domainsForSubject,
  findDomain,
  findSkill,
  type SatSubjectCode,
} from '@/lib/practice/sat-taxonomy';
import s from './Notes.module.css';

export interface NoteEditorSavePayload {
  title: string | null;
  bodyJson: NoteDoc;
  bodyText: string;
  taxonomy: NoteTaxonomy;
}

interface Props {
  initialDoc?: NoteDoc | null;
  initialTitle?: string | null;
  initialTaxonomy?: NoteTaxonomy | null;
  editable?: boolean;
  saving?: boolean;
  onSave?: (payload: NoteEditorSavePayload) => void;
  saveLabel?: string;
  /** When true, hides the title input — used by the per-question
   *  popover where the note is implicitly titled by its question. */
  hideTitle?: boolean;
  placeholder?: string;
}

const EMPTY_TAXONOMY: NoteTaxonomy = {
  subjectCode: null,
  domainCode:  null,
  domainName:  null,
  skillCode:   null,
  skillName:   null,
};

export function NoteEditor({
  initialDoc,
  initialTitle = null,
  initialTaxonomy = null,
  editable = true,
  saving = false,
  onSave,
  saveLabel = 'Save',
  hideTitle = false,
  placeholder = 'Start typing your note…',
}: Props) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [taxonomy, setTaxonomy] = useState<NoteTaxonomy>(
    initialTaxonomy ?? EMPTY_TAXONOMY,
  );
  const startingDoc: NoteDoc = useMemo(
    () => (initialDoc && Object.keys(initialDoc).length > 0 ? initialDoc : EMPTY_DOC),
    [initialDoc],
  );

  const editor = useEditor({
    extensions: [StarterKit, MathExtension, ExcalidrawExtension],
    content: startingDoc as unknown as object,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: s.editorContent,
        'aria-label': 'Note editor',
        spellcheck: 'true',
      },
    },
  });

  // External edit toggle (e.g. switching from preview to edit on the
  // detail page) needs to be propagated to the editor instance.
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // When the parent swaps in a new note (navigating to /notes/[id]
  // for a different id without a full unmount), re-seed the editor.
  useEffect(() => {
    if (!editor) return;
    setTitle(initialTitle ?? '');
    setTaxonomy(initialTaxonomy ?? EMPTY_TAXONOMY);
    editor.commands.setContent(startingDoc as unknown as object, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startingDoc]);

  const handleInsertMath = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: 'math', attrs: { latex: '' } })
      .run();
  }, [editor]);

  const handleInsertDrawing = useCallback(() => {
    if (!editor) return;
    insertExcalidraw(editor);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (!editor || !onSave) return;
    syncMathNodesFromDom(editor);
    const json = editor.getJSON() as unknown as NoteDoc;
    onSave({
      title: title.trim() || null,
      bodyJson: json,
      bodyText: docToPlainText(json),
      taxonomy: {
        subjectCode: taxonomy.subjectCode,
        domainCode:  taxonomy.domainCode,
        domainName:  taxonomy.domainName?.trim() || null,
        skillCode:   taxonomy.skillCode,
        skillName:   taxonomy.skillName?.trim() || null,
      },
    });
  }, [editor, onSave, title, taxonomy]);

  const updateTaxonomy = (patch: Partial<NoteTaxonomy>) => {
    setTaxonomy((prev) => ({ ...prev, ...patch }));
  };

  const handleSubjectChange = (rawSubject: string) => {
    const subject = rawSubject || null;
    // Subject change invalidates the current domain + skill since
    // they belong to whatever subject the student was just in.
    updateTaxonomy({
      subjectCode: subject,
      domainCode: null,
      domainName: null,
      skillCode: null,
      skillName: null,
    });
  };

  const handleDomainChange = (rawDomain: string) => {
    if (!rawDomain) {
      updateTaxonomy({
        domainCode: null,
        domainName: null,
        skillCode: null,
        skillName: null,
      });
      return;
    }
    const domain = findDomain(rawDomain);
    updateTaxonomy({
      // Selecting a domain implicitly fixes the subject too —
      // useful when the student opens a fresh note and jumps
      // straight to a domain.
      subjectCode: domain?.subjectCode ?? taxonomy.subjectCode,
      domainCode:  domain?.code ?? rawDomain,
      domainName:  domain?.name ?? null,
      skillCode:   null,
      skillName:   null,
    });
  };

  const handleSkillChange = (rawSkill: string) => {
    if (!rawSkill) {
      updateTaxonomy({ skillCode: null, skillName: null });
      return;
    }
    const skill = findSkill(taxonomy.domainCode, rawSkill);
    updateTaxonomy({
      skillCode: skill?.code ?? rawSkill,
      skillName: skill?.name ?? null,
    });
  };

  const subjectForDomainList: SatSubjectCode | null =
    taxonomy.subjectCode === 'rw' || taxonomy.subjectCode === 'math'
      ? taxonomy.subjectCode
      : null;
  const domainOptions = subjectForDomainList
    ? domainsForSubject(subjectForDomainList)
    : [];
  const skillOptions = findDomain(taxonomy.domainCode)?.skills ?? [];

  if (!editor) return <div className={s.editorEmpty}>Loading editor…</div>;

  return (
    <div className={s.editorWrap} data-editable={editable ? 'true' : 'false'}>
      {!hideTitle && (
        <input
          type="text"
          className={s.titleInput}
          placeholder="Untitled note"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!editable || saving}
          maxLength={200}
        />
      )}

      <div className={s.taxonomyRow} role="group" aria-label="Subject, domain, and skill">
        <label className={s.taxonomyField}>
          <span className={s.taxonomyLabel}>Subject</span>
          <select
            className={s.taxonomyInput}
            value={taxonomy.subjectCode ?? ''}
            onChange={(e) => handleSubjectChange(e.target.value)}
            disabled={!editable || saving}
          >
            <option value="">—</option>
            <option value="rw">Reading & Writing</option>
            <option value="math">Math</option>
          </select>
        </label>
        <label className={s.taxonomyField}>
          <span className={s.taxonomyLabel}>Domain</span>
          <select
            className={s.taxonomyInput}
            value={taxonomy.domainCode ?? ''}
            onChange={(e) => handleDomainChange(e.target.value)}
            disabled={!editable || saving || !subjectForDomainList}
          >
            <option value="">{subjectForDomainList ? '—' : 'Pick a subject first'}</option>
            {domainOptions.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className={s.taxonomyField}>
          <span className={s.taxonomyLabel}>Skill</span>
          <select
            className={s.taxonomyInput}
            value={taxonomy.skillCode ?? ''}
            onChange={(e) => handleSkillChange(e.target.value)}
            disabled={!editable || saving || skillOptions.length === 0}
          >
            <option value="">{skillOptions.length ? '—' : 'Pick a domain first'}</option>
            {skillOptions.map((sk) => (
              <option key={sk.code} value={sk.code}>{sk.name}</option>
            ))}
          </select>
        </label>
      </div>

      {editable && (
        <div className={s.toolbar} role="toolbar" aria-label="Formatting">
          <ToolbarButton
            label="B"
            ariaLabel="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            style={{ fontWeight: 700 }}
          />
          <ToolbarButton
            label="I"
            ariaLabel="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            style={{ fontStyle: 'italic' }}
          />
          <ToolbarButton
            label="H1"
            ariaLabel="Heading 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <ToolbarButton
            label="H2"
            ariaLabel="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            label="• List"
            ariaLabel="Bulleted list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1. List"
            ariaLabel="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            label="❝"
            ariaLabel="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            label="‹/›"
            ariaLabel="Code"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <span className={s.toolbarSep} aria-hidden="true" />
          <ToolbarButton
            label="∑ Math"
            ariaLabel="Insert equation"
            onClick={handleInsertMath}
          />
          <ToolbarButton
            label="✎ Drawing"
            ariaLabel="Insert drawing"
            onClick={handleInsertDrawing}
          />
        </div>
      )}

      <EditorContent editor={editor} className={s.editorBox} />

      {editable && onSave && (
        <div className={s.editorFooter}>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  ariaLabel: string;
  active?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

function ToolbarButton({ label, ariaLabel, active, onClick, style }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={active ? `${s.toolbarBtn} ${s.toolbarBtnActive}` : s.toolbarBtn}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active ? 'true' : 'false'}
      style={style}
    >
      {label}
    </button>
  );
}
