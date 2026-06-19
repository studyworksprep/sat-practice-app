'use client';

// Shared client-side figure uploader for the question-figures bucket.
// Content-addressed by SHA-256 so repeat uploads dedup and retries
// are idempotent (upsert: true). Extracted so the authoring editor
// and the draft editors can share one implementation; the older
// draft components (OptionsEditor.jsx, FieldWithUpload.jsx) still
// carry their own copy and can be migrated to this later.

import { createClient } from '@/lib/supabase/browser';

export async function uploadFigure(file) {
  const supabase = createClient();

  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const path = `${hash}.${extensionFor(file)}`;

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
