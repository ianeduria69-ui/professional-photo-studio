import { parseJpegInfo } from './jpeg';

export const POINTS_PER_INCH = 72;

export function inchesToPoints(inches: number): number {
  return inches * POINTS_PER_INCH;
}

const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

/**
 * Build a one-page PDF whose page is `pageWidthPt` x `pageHeightPt` points and
 * which shows `jpeg` stretched over the whole page. The page size is what
 * guarantees the physical print size (72 points = 1 inch).
 */
export function buildPdfFromJpeg(
  jpeg: Uint8Array,
  opts: { pageWidthPt: number; pageHeightPt: number; title?: string },
): Uint8Array {
  const info = parseJpegInfo(jpeg);
  const colorSpace = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (n: number) => {
    offsets[n] = length;
    write(`${n} 0 obj\n`);
  };

  const W = num(opts.pageWidthPt);
  const H = num(opts.pageHeightPt);
  const content = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
  const title = (opts.title ?? 'Photo Studio export').replace(/[()\\]/g, ' ');

  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObject(2);
  write('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  startObject(3);
  write(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  startObject(4);
  write(
    `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  write(jpeg);
  write('\nendstream\nendobj\n');
  startObject(5);
  write(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  startObject(6);
  write(`<< /Title (${title}) /Producer (Professional Photo Studio) >>\nendobj\n`);

  const xrefAt = length;
  write('xref\n0 7\n0000000000 65535 f \n');
  for (let n = 1; n <= 6; n++) write(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
