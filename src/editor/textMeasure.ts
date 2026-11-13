import type { Measure } from './text';

let ctx: CanvasRenderingContext2D | null = null;

/** Browser text measurement used by the store to keep text layer heights correct. */
export const measureText: Measure = (font, text) => {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
};
