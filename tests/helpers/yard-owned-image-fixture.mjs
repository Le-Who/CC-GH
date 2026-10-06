/** Real encoded still bytes for source-only bitmap substitutes. No pixel rendering. */
import { readFile } from 'node:fs/promises';
export async function ownedImageBlob(pathname) {
  const bytes = await readFile(new URL('../../public' + pathname, import.meta.url));
  let width, height;
  const kind = bytes.subarray(12, 16).toString();
  if (bytes.subarray(1, 4).toString() === 'PNG') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (kind === 'VP8X') {
    width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3);
  } else if (kind === 'VP8L') {
    const bits = bytes.readUInt32LE(21); width = 1 + (bits & 16383); height = 1 + ((bits >>> 14) & 16383);
  } else if (kind === 'VP8 ') {
    width = bytes.readUInt16LE(26) & 16383; height = bytes.readUInt16LE(28) & 16383;
  } else throw Error('Unsupported source image header: ' + pathname);
  const blob = new Blob([bytes]); blob.path = pathname; blob.fixtureDimensions = { width, height }; return blob;
}
