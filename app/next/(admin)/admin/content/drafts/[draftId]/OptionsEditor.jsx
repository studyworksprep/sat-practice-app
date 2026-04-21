'use client';

// Structured options editor for the admin draft pages. Replaces a
// hand-edited JSON textarea with one row per option — label,
// content_html textarea, and an "Upload figure" button that
// uploads to the question-figures bucket and inserts the resulting
// <img> tag directly into that row's content_html.
//
// Form integration: the component renders a hidden <input name="X">
// that carries the JSON serialization of the current options
// array. The wrapping <form>'s Server Action reads that field
// verbatim — no client JSON-editing by hand. Empty override state
// (no editor shown, hidden input empty) means "don't touch the
// questions_v2.options column on promote", matching the NULL
// semantics of stem_html / stimulus_html / rationale_html.
//
// Live preview: the side-by-side preview on the editor page
// reflects the SAVED draft, not the in-progress edit. After
// clicking Save the page re-renders with the updated options and
// the preview updates. A live-preview mode would require either
// client-side math rendering or a per-keystroke Server Action;
// both are scope creep for the initial cleanup workflow.

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

/**
 * @param {object} props
 * @param {Array|null} props.initialOptions - draft's current options value
 * @param {string}     props.name           - hidden input name (default 'options')
 */
export function OptionsEditor({ initialOptions, name = 'options' }) {
  const initialArr = Array.isArray(initialOptions) ? initialOptions : null;
  const [options, setOptions] = useState(
    initialArr == null
      ? null
      : initialArr.map((o, i) => ({
          label: o.label ?? String.fromCharCode(65 + i),
          ordinal: o.ordinal ?? i + 1,
          content_html: o.content_html ?? '',
        })),
  );

  const isOverriding = options != null;
  // Hidden input value: empty string when not overriding → emptyToNull
  // in the Server Action parses that as NULL, leaving questions_v2.options
  // untouched on promote.
  const serialized = isOverriding ? JSON.stringify(options) : '';

  function enableOverride() {
    setOptions([
      { label: 'A', ordinal: 1, content_html: '' },
      { label: 'B', ordinal: 2, content_html: '' },
      { label: 'C', ordinal: 3, content_html: '' },
      { label: 'D', ordinal: 4, content_html: '' },
    ]);
  }

  function disableOverride() {
    const sure = window.confirm(
      'Discard all option edits and leave the production options unchanged on promote?',
    );
    if (sure) setOptions(null);
  }

  function updateOption(i, patch) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  function removeOption(i) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addOption() {
    setOptions((prev) => [
      ...prev,
      {
        label: String.fromCharCode(65 + prev.length),
        ordinal: prev.length + 1,
        content_html: '',
      },
    ]);
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <label style={S.headerLabel}>options</label>
        {isOverriding ? (
          <button type="button" onClick={disableOverride} style={S.textBtn}>
            Discard override (leave production options unchanged)
          </button>
        ) : (
          <button type="button" onClick={enableOverride} style={S.primaryBtn}>
            Override options in this draft
          </button>
        )}
      </div>

      <input type="hidden" name={name} value={serialized} />

      {!isOverriding && (
        <p style={S.hint}>
          This draft won&apos;t touch options. The production{' '}
          <code>questions_v2.options</code> value stays in place.
        </p>
      )}

      {isOverriding && (
        <>
          {options.length === 0 ? (
            <p style={S.hint}>
              No options in override. Promoting this draft would set{' '}
              <code>options = []</code>. Add an option below, or discard the
              override if you didn&apos;t mean to touch this field.
            </p>
          ) : (
            options.map((opt, i) => (
              <OptionRow
                key={i}
                index={i}
                option={opt}
                onChange={(patch) => updateOption(i, patch)}
                onRemove={() => removeOption(i)}
              />
            ))
          )}
          <button type="button" onClick={addOption} style={S.addBtn}>
            + Add option
          </button>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Per-option row: label / ordinal / content_html + upload button.
// ──────────────────────────────────────────────────────────────

function OptionRow({ index, option, onChange, onRemove }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploadState, setUploadState] = useState({ uploading: false, error: null });

  async function onFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-upload of same filename
    if (!file) return;
    setUploadState({ uploading: true, error: null });
    try {
      const url = await uploadFigure(file);
      const tag = `<img src="${url}" alt="" style="max-width:100%;" />`;
      insertAtCursor(textareaRef.current, option.content_html, tag, (nextValue) =>
        onChange({ content_html: nextValue }),
      );
      setUploadState({ uploading: false, error: null });
    } catch (err) {
      setUploadState({ uploading: false, error: err.message || String(err) });
    }
  }

  return (
    <div style={S.row}>
      <div style={S.rowHeader}>
        <label style={S.smallLabel}>
          label
          <input
            type="text"
            value={option.label}
            onChange={(e) => onChange({ label: e.target.value })}
            style={S.labelInput}
          />
        </label>
        <label style={S.smallLabel}>
          ordinal
          <input
            type="number"
            value={option.ordinal}
            onChange={(e) => onChange({ ordinal: Number(e.target.value) })}
            style={S.ordinalInput}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onRemove} style={S.removeBtn}>
          Remove option {index + 1}
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={option.content_html}
        onChange={(e) => onChange({ content_html: e.target.value })}
        rows={4}
        style={S.textarea}
      />

      <div style={S.uploadRow}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFilePicked}
          disabled={uploadState.uploading}
          style={S.fileInput}
        />
        {uploadState.uploading && <span style={S.uploading}>Uploading…</span>}
        {uploadState.error && <span style={S.error}>{uploadState.error}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Upload helper — content-addressed path so repeat uploads dedup
// and retries are safe.
// ──────────────────────────────────────────────────────────────

async function uploadFigure(file) {
  const supabase = createClient();

  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ext = extensionFor(file);
  const path = `${hash}.${ext}`;

  const { error } = await supabase.storage
    .from('question-figures')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);

  const { data } = supabase.storage.from('question-figures').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('upload succeeded but getPublicUrl returned nothing');
  return data.publicUrl;
}

function extensionFor(file) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,6}$/.test(fromName)) return fromName;
  // Fallback from MIME type: "image/svg+xml" → "svg", "image/png" → "png"
  const type = file.type?.split('/')[1]?.split('+')[0]?.toLowerCase();
  return type && /^[a-z0-9]{1,6}$/.test(type) ? type : 'bin';
}

// ──────────────────────────────────────────────────────────────
// Cursor-aware textarea insertion. The textarea is controlled by
// React, so we can't mutate its value directly — instead we
// compute the next string and call the parent onChange, which
// re-renders with the new value. Cursor position is not restored
// (would need a post-render effect); accepted as MVP tradeoff.
// ──────────────────────────────────────────────────────────────

function insertAtCursor(textarea, currentValue, insertion, onValueChange) {
  if (!textarea) {
    onValueChange(currentValue + insertion);
    return;
  }
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const next = currentValue.slice(0, start) + insertion + currentValue.slice(end);
  onValueChange(next);
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const S = {
  wrap: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    padding: '0.75rem',
    border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' },
  headerLabel: { fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  hint: { color: '#6b7280', fontSize: '0.85rem', margin: '0.25rem 0' },
  primaryBtn: {
    padding: '0.375rem 0.75rem', background: '#2563eb', color: 'white',
    border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem',
    cursor: 'pointer',
  },
  textBtn: {
    padding: '0.25rem 0.5rem', background: 'transparent', color: '#991b1b',
    border: 'none', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline',
  },
  addBtn: {
    padding: '0.375rem 0.75rem', background: 'white', color: '#374151',
    border: '1px dashed #9ca3af', borderRadius: 6, fontWeight: 500,
    cursor: 'pointer', fontSize: '0.85rem', alignSelf: 'flex-start',
  },
  row: {
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    padding: '0.75rem',
    border: '1px solid #d1d5db', borderRadius: 6, background: 'white',
  },
  rowHeader: { display: 'flex', alignItems: 'flex-end', gap: '0.75rem' },
  smallLabel: { display: 'flex', flexDirection: 'column', gap: '0.125rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 },
  labelInput: {
    padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4,
    width: '4rem', fontSize: '0.9rem', fontWeight: 400,
  },
  ordinalInput: {
    padding: '0.25rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 4,
    width: '4rem', fontSize: '0.9rem', fontWeight: 400,
  },
  removeBtn: {
    padding: '0.25rem 0.5rem', background: 'white', color: '#991b1b',
    border: '1px solid #fca5a5', borderRadius: 4, fontWeight: 500,
    cursor: 'pointer', fontSize: '0.75rem',
  },
  textarea: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db', borderRadius: 4,
    fontSize: '0.9rem', lineHeight: 1.4, resize: 'vertical',
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  },
  uploadRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' },
  fileInput: { fontSize: '0.85rem' },
  uploading: { color: '#2563eb' },
  error: { color: '#991b1b' },
};
