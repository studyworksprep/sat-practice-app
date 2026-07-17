// Server-side counterpart of lib/content/upload-figure-client.js:
// uploads a rendered SVG figure to the shared question-figures bucket
// and returns its public URL. Content-addressed by SHA-256 so repeat
// uploads dedup and retries are idempotent (upsert: true) — the same
// convention the client uploader uses for admin-picked images.

import { createHash } from 'crypto';

// Structural slice of the Supabase client so any authed client
// (route ctx, server action ctx) can be passed without coupling to a
// specific generated client type.
interface StorageClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

export async function uploadSvgFigure(supabase: StorageClient, svg: string): Promise<string> {
  const hash = createHash('sha256').update(svg).digest('hex');
  const path = `${hash}.svg`;
  const bucket = supabase.storage.from('question-figures');

  const { error } = await bucket.upload(path, Buffer.from(svg, 'utf8'), {
    contentType: 'image/svg+xml',
    upsert: true,
  });
  if (error) throw new Error(`figure upload failed: ${error.message}`);

  const { data } = bucket.getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('figure upload succeeded but no public URL returned');
  return data.publicUrl;
}
