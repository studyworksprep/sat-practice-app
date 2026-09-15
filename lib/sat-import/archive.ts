import { unzipSync, strFromU8 } from 'fflate';

export function readMathpix(bytes: Uint8Array, name: string) {
  if (bytes.length > 8_000_000) throw new Error('Mathpix export must be under 8 MB.');
  if (name.toLowerCase().endsWith('.mmd')) return { mmd: strFromU8(bytes), images: {} };
  if (!name.toLowerCase().endsWith('.zip')) throw new Error('Choose a .mmd file or Mathpix .zip export.');
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, { filter: entry => {
    if (++count > 500 || entry.originalSize > 8_000_000 || (total += entry.originalSize) > 12_000_000) throw new Error('ZIP expands beyond the 12 MB / 500 file limit.');
    if (entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error('Unsafe path in ZIP.');
    return /\.(mmd|png|jpe?g|webp)$/i.test(entry.name) && !entry.name.startsWith('__MACOSX/');
  }});
  const names = Object.keys(files).filter(n => n.endsWith('.mmd'));
  if (names.length !== 1) throw new Error('The ZIP must contain exactly one .mmd file.');
  const prefix = names[0].slice(0, names[0].lastIndexOf('/') + 1);
  const images: Record<string, string> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path === names[0] || !path.startsWith(prefix)) continue;
    const type = /\.png$/i.test(path) ? 'png' : /\.webp$/i.test(path) ? 'webp' : 'jpeg';
    images[path.slice(prefix.length)] = `data:image/${type};base64,${Buffer.from(data).toString('base64')}`;
  }
  return { mmd: strFromU8(files[names[0]]), images };
}
