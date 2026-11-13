import type { ImageCache } from '../editor/imageCache';
import { renderDocument } from '../editor/renderer';
import type { DocumentModel } from '../types';
import { projectFileNameStem } from '../services/names';
import { setJpegDpi } from './jpeg';
import { buildPdfFromJpeg, POINTS_PER_INCH } from './pdf';
import { setPngDpi } from './png';
import { canvasSizeProblem, exportPixelSize } from './size';

export type ExportFormat = 'png' | 'jpg' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  /** JPEG quality 0.1 .. 1 (also used for the picture inside a PDF). */
  quality: number;
  /** Output resolution. Pixel size = document size x dpi / document dpi. */
  dpi: number;
  /** Colour used behind transparent areas when the format cannot store transparency. */
  flattenColor?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  dpi: number;
  mime: string;
}

export const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
};

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image (it may be too large).'))),
      type,
      quality,
    );
  });
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draws the whole document at full quality into a new canvas of the export size. */
export async function renderDocumentToCanvas(
  doc: DocumentModel,
  cache: ImageCache,
  dpi: number,
  flattenColor?: string,
): Promise<HTMLCanvasElement> {
  const size = exportPixelSize(doc, dpi);
  const problem = canvasSizeProblem(size.width, size.height);
  if (problem) throw new Error(problem);
  await cache.prepareFull(doc);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  if (flattenColor) {
    ctx.fillStyle = flattenColor;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  const sx = size.width / doc.width;
  const sy = size.height / doc.height;
  ctx.scale(sx, sy);
  renderDocument(ctx, doc, { provider: cache, quality: 'full', drawBackground: true, pixelScale: Math.min(sx, sy) });
  return canvas;
}

/** Encodes an already drawn canvas in the chosen format with correct resolution metadata. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  opts: Pick<ExportOptions, 'format' | 'quality' | 'dpi'>,
  name: string,
): Promise<ExportResult> {
  const stem = projectFileNameStem(name);
  const width = canvas.width;
  const height = canvas.height;
  if (opts.format === 'png') {
    const png = setPngDpi(await blobBytes(await canvasToBlob(canvas, MIME.png)), opts.dpi);
    return { blob: new Blob([png as BlobPart], { type: MIME.png }), filename: `${stem}.png`, width, height, dpi: opts.dpi, mime: MIME.png };
  }
  const q = Math.max(0.1, Math.min(1, opts.quality));
  const jpeg = setJpegDpi(await blobBytes(await canvasToBlob(canvas, MIME.jpg, q)), opts.dpi);
  if (opts.format === 'jpg') {
    return { blob: new Blob([jpeg as BlobPart], { type: MIME.jpg }), filename: `${stem}.jpg`, width, height, dpi: opts.dpi, mime: MIME.jpg };
  }
  const pdf = buildPdfFromJpeg(jpeg, {
    pageWidthPt: (width / opts.dpi) * POINTS_PER_INCH,
    pageHeightPt: (height / opts.dpi) * POINTS_PER_INCH,
    title: name,
  });
  return { blob: new Blob([pdf as BlobPart], { type: MIME.pdf }), filename: `${stem}.pdf`, width, height, dpi: opts.dpi, mime: MIME.pdf };
}

/** Export a document as PNG (keeps transparency), JPG or PDF. */
export async function exportDocument(doc: DocumentModel, cache: ImageCache, opts: ExportOptions): Promise<ExportResult> {
  const flatten = opts.format === 'png' ? undefined : (opts.flattenColor ?? '#ffffff');
  const canvas = await renderDocumentToCanvas(doc, cache, opts.dpi, flatten);
  return encodeCanvas(canvas, opts, doc.name);
}
