const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function isPng(b: Uint8Array): boolean {
  return b.length > 8 && PNG_SIG.every((v, i) => b[i] === v);
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export function dpiToPixelsPerMetre(dpi: number): number {
  return Math.round(dpi / 0.0254);
}

/** Return a copy of the PNG whose pHYs chunk declares `dpi` pixels per inch. */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!isPng(png)) throw new Error('Not a PNG file.');
  const ppm = dpiToPixelsPerMetre(dpi);

  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));

  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let pos = 8;
  let inserted = false;
  while (pos + 12 <= png.length) {
    const len = u32(png, pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const end = pos + 12 + len;
    if (type !== 'pHYs') parts.push(png.subarray(pos, end));
    if (type === 'IHDR' && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    pos = end;
  }
  if (!inserted) throw new Error('PNG has no IHDR chunk.');
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Read DPI from the pHYs chunk (null when absent or not in metres). */
export function readPngDpi(png: Uint8Array): number | null {
  if (!isPng(png)) return null;
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len = u32(png, pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === 'pHYs' && png[pos + 16] === 1) return Math.round(u32(png, pos + 8) * 0.0254);
    pos += 12 + len;
  }
  return null;
}

export function readPngSize(png: Uint8Array): { width: number; height: number } | null {
  if (!isPng(png) || png.length < 24) return null;
  return { width: u32(png, 16), height: u32(png, 20) };
}
