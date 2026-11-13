import type { ImageLayer } from '../types';
import { docToAssetPoint, type Point } from '../utils/geometry';
import { hexToRgb } from '../utils/color';
import type { PixelBuffer } from '../image-processing/adjustments';
import type { BrushSettings } from './store';
import type { Source } from './imageCache';

/** Full-resolution editable copy of an image layer's pixels, used by brush / eraser / cut-out tools. */
export interface RasterSession {
  layerId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastPoint: Point | null;
  changed: boolean;
}

export function beginRaster(layer: ImageLayer, src: Source): RasterSession {
  const canvas = document.createElement('canvas');
  canvas.width = layer.naturalWidth;
  canvas.height = layer.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { layerId: layer.id, canvas, ctx, lastPoint: null, changed: false };
}

export type StrokeMode = 'paint' | 'erase';

function stamp(
  ctx: CanvasRenderingContext2D,
  p: Point,
  radius: number,
  hardness: number,
  rgb: [number, number, number],
  alpha: number,
  mode: StrokeMode,
): void {
  const r = Math.max(0.5, radius);
  const inner = (Math.max(0, Math.min(100, hardness)) / 100) * r;
  const g = ctx.createRadialGradient(p.x, p.y, inner, p.x, p.y, r);
  const color = mode === 'erase' ? '0,0,0' : `${rgb[0]},${rgb[1]},${rgb[2]}`;
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Paint or erase along a segment from the last point. Points are in document
 * space; they are mapped into the picture's own pixels so strokes stay sharp
 * regardless of how the layer is scaled / rotated.
 */
export function strokeTo(
  session: RasterSession,
  layer: ImageLayer,
  docPoint: Point,
  brush: BrushSettings,
  color: string,
  mode: StrokeMode,
): void {
  const p = docToAssetPoint(layer, docPoint);
  const scale = layer.naturalWidth / Math.max(1, layer.width);
  const radius = (brush.size / 2) * scale;
  const alpha = brush.opacity / 100;
  const rgb = hexToRgb(color);
  const ctx = session.ctx;
  ctx.save();
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
  const last = session.lastPoint;
  if (last) {
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, radius * 0.25);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      stamp(ctx, { x: last.x + (dx * i) / n, y: last.y + (dy * i) / n }, radius, brush.hardness, rgb, alpha * 0.35 + 0.0, mode);
    }
  } else {
    stamp(ctx, p, radius, brush.hardness, rgb, alpha, mode);
  }
  ctx.restore();
  session.lastPoint = p;
  session.changed = true;
}

export function getPixels(session: RasterSession): ImageData {
  return session.ctx.getImageData(0, 0, session.canvas.width, session.canvas.height);
}

export function putPixels(session: RasterSession, img: PixelBuffer): void {
  session.ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  session.changed = true;
}

/** PNG data URL of the edited pixels (PNG keeps transparency). */
export function rasterToDataUrl(session: RasterSession): string {
  return session.canvas.toDataURL('image/png');
}
