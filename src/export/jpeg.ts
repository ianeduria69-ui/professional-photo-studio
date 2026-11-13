function isJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
}

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00];

function hasJfif(b: Uint8Array, at: number): boolean {
  return b[at] === 0xff && b[at + 1] === 0xe0 && JFIF.every((v, i) => b[at + 4 + i] === v);
}

/** Return a copy of the JPEG whose JFIF header declares `dpi` pixels per inch. */
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (!isJpeg(jpeg)) throw new Error('Not a JPEG file.');
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  if (hasJfif(jpeg, 2)) {
    const out = new Uint8Array(jpeg);
    out[2 + 11] = 1; // units: dots per inch
    out[2 + 12] = d >> 8;
    out[2 + 13] = d & 0xff;
    out[2 + 14] = d >> 8;
    out[2 + 15] = d & 0xff;
    return out;
  }
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, ...JFIF, 0x01, 0x01, 0x01, d >> 8, d & 0xff, d >> 8, d & 0xff, 0x00, 0x00,
  ]);
  const out = new Uint8Array(jpeg.length + app0.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(jpeg.subarray(2), 2 + app0.length);
  return out;
}

/** Read DPI from the JFIF header (null when absent). */
export function readJpegDpi(jpeg: Uint8Array): number | null {
  if (!isJpeg(jpeg) || !hasJfif(jpeg, 2)) return null;
  const units = jpeg[2 + 11];
  const x = (jpeg[2 + 12] << 8) | jpeg[2 + 13];
  if (units === 1) return x;
  if (units === 2) return Math.round(x * 2.54);
  return null;
}

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
}

/** Find the SOF marker and read the picture size and channel count. */
export function parseJpegInfo(jpeg: Uint8Array): JpegInfo {
  if (!isJpeg(jpeg)) throw new Error('Not a JPEG file.');
  let pos = 2;
  while (pos + 9 < jpeg.length) {
    if (jpeg[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = jpeg[pos + 1];
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    const len = (jpeg[pos + 2] << 8) | jpeg[pos + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        height: (jpeg[pos + 5] << 8) | jpeg[pos + 6],
        width: (jpeg[pos + 7] << 8) | jpeg[pos + 8],
        components: jpeg[pos + 9],
      };
    }
    pos += 2 + len;
  }
  throw new Error('JPEG has no frame header.');
}
