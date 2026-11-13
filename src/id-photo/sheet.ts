import type { Placement, SheetLayout } from './layout';

export interface SheetRenderOptions {
  paperColor: string;
  /** Thin guide lines around every photo to help cutting. */
  cutMarks: boolean;
  /** Device scale: pixels of the paper per output pixel (1 for the real export). */
  dpi: number;
}

/** Draws every placement of `layout` with the same ID photo on a paper-sized canvas. */
export function drawSheet(
  ctx: CanvasRenderingContext2D,
  layout: SheetLayout,
  photo: CanvasImageSource,
  o: SheetRenderOptions,
): void {
  ctx.fillStyle = o.paperColor;
  ctx.fillRect(0, 0, layout.paperWidthPx, layout.paperHeightPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const p of layout.placements) ctx.drawImage(photo, p.x, p.y, p.width, p.height);
  if (o.cutMarks) {
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = Math.max(1, Math.round(o.dpi / 150));
    for (const p of layout.placements) strokeOutside(ctx, p, ctx.lineWidth);
  }
}

function strokeOutside(ctx: CanvasRenderingContext2D, p: Placement, w: number): void {
  ctx.strokeRect(p.x - w / 2, p.y - w / 2, p.width + w, p.height + w);
}
