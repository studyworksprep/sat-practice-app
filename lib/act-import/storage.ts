// Fetch act-imports bucket objects as base64 strings for Claude
// document blocks.
//
// The bucket is private (admin-only RLS), so the parser pulls
// the file via the supabase client's storage download API
// rather than constructing a public URL. That keeps reads
// gated on the same admin check the rest of the pipeline uses
// and means no signed URL needs to leave the server.

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'act-imports';

export interface DownloadedFile {
  base64: string;
  byteLength: number;
}

/** Download a path from the act-imports bucket and return it
 *  base64-encoded — the shape Anthropic's `document` content
 *  block wants in `source.data`. Throws if the object is
 *  missing or the storage call errors. */
export async function downloadAsBase64(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  path: string,
): Promise<DownloadedFile> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Could not download ${path}: ${error?.message ?? 'unknown error'}`);
  }
  const arrayBuf = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  // Manual base64 encode (Node's Buffer is available in Next
  // server contexts, but using Uint8Array → binary string → btoa
  // keeps this transport-agnostic).
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : btoa(binary);
  return { base64, byteLength: bytes.byteLength };
}

/** Download an act-imports object as UTF-8 text. Used for the
 *  Mathpix HTML upload (the math-section parser ingests it as
 *  structured text alongside the test PDF). */
export async function downloadAsText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Could not download ${path}: ${error?.message ?? 'unknown error'}`);
  }
  return await data.text();
}
