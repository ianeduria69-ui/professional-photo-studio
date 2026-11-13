import type { DocumentModel, ImageLayer, Layer, ShapeLayer, TextLayer } from '../types';
import { fontString, layoutText } from './text';

export type ImageQuality = 'preview' | 'full';

export interface ImageProvider {
  /** Picture to draw for an image layer (adjusted if needed), or null while it is still loading. */
  getImage(layer: ImageLayer, quality: ImageQuality): CanvasImageSource | null;
}

export interface RenderOptions {
  provider: ImageProvider;
  quality: ImageQuality;
  /** Fill the canvas background colour (skipped when the document is transparent). */
  drawBackground: boolean;
  /**
   * Device pixels per document pixel at the current transform. Canvas shadows
   * ignore the transform, so their blur/offset are multiplied by this.
   */
  pixelScale: number;
}

export function renderDocument(ctx: CanvasRenderingContext2D, doc: DocumentModel, opts: RenderOptions): void {
  if (opts.drawBackground && !doc.background.transparent) {
    ctx.fillStyle = doc.background.color;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of doc.layers) {
    if (layer.visible) drawLayer(ctx, layer, opts);
  }
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (radius === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer): void {
  const sw = Math.max(0, l.strokeWidth);
  if (l.shape === 'line') {
    if (!l.stroke || sw <= 0) return;
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = sw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sw / 2, l.height / 2);
    ctx.lineTo(Math.max(sw / 2, l.width - sw / 2), l.height / 2);
    ctx.stroke();
    return;
  }
  const inset = sw / 2;
  if (l.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(l.width / 2, l.height / 2, Math.max(0, l.width / 2 - inset), Math.max(0, l.height / 2 - inset), 0, 0, Math.PI * 2);
  } else {
    roundedRectPath(ctx, inset, inset, Math.max(0, l.width - sw), Math.max(0, l.height - sw), l.cornerRadius);
  }
  if (l.fill) {
    ctx.fillStyle = l.fill;
    ctx.fill();
  }
  if (l.stroke && sw > 0) {
    ctx.strokeStyle = l.stroke;
    ctx.lineWidth = sw;
    ctx.stroke();
  }
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer): void {
  const measure = (font: string, text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  const lay = layoutText(l, measure);
  ctx.font = fontString(l);
  ctx.fillStyle = l.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = l.align;
  const x = l.align === 'left' ? 0 : l.align === 'center' ? l.width / 2 : l.width;
  const halfLeading = (lay.lineHeightPx - l.fontSize) / 2;
  lay.lines.forEach((line, i) => ctx.fillText(line, x, i * lay.lineHeightPx + halfLeading));
}

export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, opts: RenderOptions): void {
  ctx.save();
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  ctx.translate(-layer.width / 2, -layer.height / 2);
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

  if (layer.shadow.enabled) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur * opts.pixelScale;
    ctx.shadowOffsetX = layer.shadow.offsetX * opts.pixelScale;
    ctx.shadowOffsetY = layer.shadow.offsetY * opts.pixelScale;
  }

  switch (layer.kind) {
    case 'image': {
      const img = opts.provider.getImage(layer, opts.quality);
      if (img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, layer.width, layer.height);
      }
      break;
    }
    case 'text':
      drawText(ctx, layer);
      break;
    case 'shape':
      drawShape(ctx, layer);
      break;
  }

  const isLine = layer.kind === 'shape' && layer.shape === 'line';
  if (layer.border.enabled && layer.border.width > 0 && !isLine) {
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = layer.border.color;
    ctx.lineWidth = layer.border.width;
    const b = layer.border.width / 2;
    ctx.strokeRect(b, b, Math.max(0, layer.width - layer.border.width), Math.max(0, layer.height - layer.border.width));
  }
  ctx.restore();
}
