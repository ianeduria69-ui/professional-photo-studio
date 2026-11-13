import type { DocumentModel } from '../types';

/** Browsers refuse canvases beyond roughly these limits. */
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_000_000;

/** Pixel size of an export of `doc` rendered at `dpi` (doc.dpi is the document's own resolution). */
export function exportPixelSize(
  doc: Pick<DocumentModel, 'width' | 'height' | 'dpi'>,
  dpi: number,
): { width: number; height: number } {
  const scale = dpi / doc.dpi;
  return { width: Math.max(1, Math.round(doc.width * scale)), height: Math.max(1, Math.round(doc.height * scale)) };
}

/** Returns an error message when the size cannot be rendered by a browser canvas. */
export function canvasSizeProblem(width: number, height: number): string | null {
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA) {
    return `${width} × ${height} px is too large for the browser to render. Lower the export DPI or the canvas size.`;
  }
  return null;
}
