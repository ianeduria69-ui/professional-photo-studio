import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { readPngDpi, readPngSize, setPngDpi, dpiToPixelsPerMetre } from '../src/export/png';
import { parseJpegInfo, readJpegDpi, setJpegDpi } from '../src/export/jpeg';
import { buildPdfFromJpeg, inchesToPoints } from '../src/export/pdf';
import { createDocument } from '../src/editor/document';
import { computeSheetLayout } from '../src/id-photo/layout';
import {
  paperById,
  paperPixelSize,
  presetById,
  presetPixelSize,
  toInches,
} from '../src/id-photo/presets';
import { exportPixelSize } from '../src/export/size';

const DPI = 300;

async function png(w: number, h: number, channels: 3 | 4 = 4): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: w, height: h, channels, background: { r: 200, g: 60, b: 60, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
}

async function jpeg(w: number, h: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 200 } } })
      .jpeg({ quality: 90 })
      .toBuffer(),
  );
}

test('exported pixel size follows document size and requested DPI', () => {
  const doc = createDocument({ width: 600, height: 600, dpi: 300 });
  assert.deepEqual(exportPixelSize(doc, 300), { width: 600, height: 600 });
  assert.deepEqual(exportPixelSize(doc, 600), { width: 1200, height: 1200 });
  assert.deepEqual(exportPixelSize(doc, 150), { width: 300, height: 300 });
  const web = createDocument({ width: 1080, height: 1080, dpi: 72 });
  assert.deepEqual(exportPixelSize(web, 72), { width: 1080, height: 1080 });
});

test('PNG: pHYs chunk sets 300 DPI, image data is untouched', async () => {
  const src = await png(600, 600);
  assert.notEqual(readPngDpi(src), 300, 'sharp writes its own default density (about 25 DPI), not 300');
  const out = setPngDpi(src, 300);
  assert.equal(readPngDpi(out), 300);
  assert.deepEqual(readPngSize(out), { width: 600, height: 600 });
  assert.equal(dpiToPixelsPerMetre(300), 11811);

  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 600);
  assert.equal(Math.round(meta.density ?? 0), 300);
  assert.equal(meta.hasAlpha, true, 'transparency channel is preserved');

  const a = await sharp(src).raw().toBuffer();
  const b = await sharp(out).raw().toBuffer();
  assert.ok(Buffer.compare(a, b) === 0, 'pixels identical');
});

test('PNG: replacing an existing pHYs does not duplicate it', async () => {
  const once = setPngDpi(await png(50, 50), 150);
  const twice = setPngDpi(once, 600);
  assert.equal(readPngDpi(twice), 600);
  const text = Buffer.from(twice).toString('latin1');
  assert.equal(text.split('pHYs').length - 1, 1);
  assert.throws(() => setPngDpi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 300));
});

test('JPEG: JFIF header is inserted when the encoder wrote none, and the picture still decodes', async () => {
  const src = await jpeg(600, 600);
  assert.equal(readJpegDpi(src), null, 'sharp writes no JFIF header');
  const out = setJpegDpi(src, 300);
  assert.equal(readJpegDpi(out), 300);
  assert.equal(out.length, src.length + 18, 'one 18-byte APP0 segment added');
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 600);
  assert.equal(Math.round(meta.density ?? 0), 300);
  assert.deepEqual(parseJpegInfo(out), { width: 600, height: 600, components: 3 });
});

test('JPEG: an existing JFIF header (what browsers write) is patched in place', async () => {
  const withJfif = setJpegDpi(await jpeg(64, 64), 72);
  assert.equal(readJpegDpi(withJfif), 72);
  const out = setJpegDpi(withJfif, 300);
  assert.equal(out.length, withJfif.length, 'same size: only the density bytes change');
  assert.equal(readJpegDpi(out), 300);
  assert.equal(Math.round((await sharp(out).metadata()).density ?? 0), 300);
  assert.throws(() => setJpegDpi(new Uint8Array([1, 2, 3, 4, 5]), 300));
});

test('PDF: page size is the physical paper size (A4 and 4R) and embeds the image', async () => {
  const A4 = { w: inchesToPoints(210 / 25.4), h: inchesToPoints(297 / 25.4) };
  const j = await jpeg(248, 351);
  const bytes = buildPdfFromJpeg(j, { pageWidthPt: A4.w, pageHeightPt: A4.h, title: 'Test (sheet)' });
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  assert.match(Buffer.from(bytes.subarray(bytes.length - 6)).toString(), /%%EOF/);

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const size = pdf.getPage(0).getSize();
  assert.ok(Math.abs(size.width - 595.276) < 0.01, `width ${size.width}`);
  assert.ok(Math.abs(size.height - 841.89) < 0.01, `height ${size.height}`);

  const fourR = buildPdfFromJpeg(await jpeg(120, 180), { pageWidthPt: 4 * 72, pageHeightPt: 6 * 72 });
  const s2 = (await PDFDocument.load(fourR)).getPage(0).getSize();
  assert.deepEqual([s2.width, s2.height], [288, 432]);
  assert.match(Buffer.from(fourR).toString('latin1'), /\/Subtype \/Image/);
  assert.match(Buffer.from(fourR).toString('latin1'), /\/DCTDecode/);
});

test('print sheet at 300 DPI: simulated render keeps the physical size (4R = 4x6 in)', async () => {
  // The browser draws the sheet on a canvas; here sharp stands in for that raster step
  // so the same layout numbers and the same DPI writers are verified end to end.
  const paper = paperPixelSize(paperById('4R')!, DPI);
  const photoPreset = presetById('2x2in')!;
  const photo = presetPixelSize(photoPreset, DPI);
  const layout = computeSheetLayout({
    paperWidthPx: paper.width,
    paperHeightPx: paper.height,
    photoWidthPx: photo.width,
    photoHeightPx: photo.height,
    marginPx: 0,
    gapPx: 0,
    copies: 6,
    autoRotate: false,
  });
  assert.equal(layout.placements.length, 6);

  const tile = await sharp({
    create: { width: photo.width, height: photo.height, channels: 3, background: { r: 20, g: 100, b: 200 } },
  })
    .png()
    .toBuffer();

  const sheet = await sharp({
    create: { width: layout.paperWidthPx, height: layout.paperHeightPx, channels: 3, background: '#ffffff' },
  })
    .composite(layout.placements.map((p) => ({ input: tile, left: p.x, top: p.y })))
    .png()
    .toBuffer();

  const stamped = setPngDpi(new Uint8Array(sheet), DPI);
  const meta = await sharp(stamped).metadata();
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 1800);
  const dpi = readPngDpi(stamped)!;
  assert.equal(meta.width! / dpi, 4, 'width is exactly 4 inches when printed');
  assert.equal(meta.height! / dpi, 6, 'height is exactly 6 inches when printed');

  // every photo cell is filled with the tile colour (the 6 photos tile the whole 4R sheet)
  const { data, info } = await sharp(stamped).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return Array.from(data.subarray(i, i + 3));
  };
  for (const p of layout.placements) {
    assert.deepEqual(at(p.x + 10, p.y + 10), [20, 100, 200]);
    assert.deepEqual(at(p.x + p.width - 1, p.y + p.height - 1), [20, 100, 200]);
  }

  // each single ID photo is exactly 2 inches when printed at 300 DPI
  const single = setPngDpi(new Uint8Array(tile), DPI);
  const sm = await sharp(single).metadata();
  assert.equal(sm.width! / readPngDpi(single)!, toInches(photoPreset.width, photoPreset.unit));
});

test('passport-size export keeps its physical size at 300 DPI (within one pixel)', async () => {
  const p = presetById('passport-35x45')!;
  const px = presetPixelSize(p, DPI);
  const out = setPngDpi(await png(px.width, px.height), DPI);
  const meta = await sharp(out).metadata();
  const widthMm = (meta.width! / readPngDpi(out)!) * 25.4;
  const heightMm = (meta.height! / readPngDpi(out)!) * 25.4;
  assert.ok(Math.abs(widthMm - 35) < 25.4 / DPI, `${widthMm}`);
  assert.ok(Math.abs(heightMm - 45) < 25.4 / DPI, `${heightMm}`);
});
