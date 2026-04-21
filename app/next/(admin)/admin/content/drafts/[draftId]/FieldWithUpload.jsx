'use client';

// Controlled textarea + labeled upload widget. Used in the draft
// editor for stem_html / stimulus_html / rationale_html so admins
// can drop a figure into any of the three at cursor position
// without routing through the Supabase Storage console or the
// options-level uploader. Mirrors the upload behavior of
// OptionsEditor.jsx — content-addressed filenames, upsert: true
// for dedup, <img> tag inserted at caret — but for a single flat
// field rather than an array of options.

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function FieldWithUpload({
  label,
  name,
  defaultValue = '',
  rows = 5,
  mono = false,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [value, setValue] = useState(defaultValue ?? '');
  const [uploadState, setUploadState] = useState({ uploading: false, error: null });

  async function onFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadState({ uploading: true, error: null });
    try {
      const url = await uploadFigure(file);
      const tag = `<img src="${url}" alt="" style="max-width:100%;" />`;
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? value.length;
      const end   = ta?.selectionEnd   ?? value.length;
      setValue(value.slice(0, start) + tag + value.slice(end));
      setUploadState({ uploading: false, error: null });
    } catch (err) {
      setUploadState({ uploading: false, error: err.message || String(err) });
    }
  }

  return (
    <label style={S.wrap}>
      <div style={S.header}>
        <span>{label}</span>
        <span style={S.uploadInline}>
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
        </span>
      </div>
      <textarea
        ref={textareaRef}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        style={{
          ...S.textarea,
          fontFamily: mono ? 'ui-monospace, Menlo, Consolas, monospace' : 'inherit',
          fontSize: mono ? '0.85rem' : '0.95rem',
        }}
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────
// Shared upload helper. Parallel to OptionsEditor.jsx's version —
// could be extracted to lib/content/upload-figure-client.js if a
// third caller shows up.
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
  const type = file.type?.split('/')[1]?.split('+')[0]?.toLowerCase();
  return type && /^[a-z0-9]{1,6}$/.test(type) ? type : 'bin';
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' },
  uploadInline: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 400 },
  fileInput: { fontSize: '0.75rem' },
  uploading: { color: '#2563eb' },
  error: { color: '#991b1b' },
  textarea: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: '0.95rem', lineHeight: 1.4, resize: 'vertical', fontWeight: 400,
  },
};
