import type { ImageLayer, LayerBase } from '../types';

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Box = Pick<LayerBase, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export const toRad = (deg: number) => (deg * Math.PI) / 180;
export const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function rotateAround(p: Point, c: Point, deg: number): Point {
  const r = toRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** World point -> coordinates inside the unrotated box (0,0 = top-left). */
export function worldToLocal(b: Box, p: Point): Point {
  const q = rotateAround(p, boxCenter(b), -b.rotation);
  return { x: q.x - b.x, y: q.y - b.y };
}

export function localToWorld(b: Box, p: Point): Point {
  return rotateAround({ x: b.x + p.x, y: b.y + p.y }, boxCenter(b), b.rotation);
}

export function boxCorners(b: Box): Point[] {
  return [
    localToWorld(b, { x: 0, y: 0 }),
    localToWorld(b, { x: b.width, y: 0 }),
    localToWorld(b, { x: b.width, y: b.height }),
    localToWorld(b, { x: 0, y: b.height }),
  ];
}

/** Axis-aligned bounds of the rotated box. */
export function boxBounds(b: Box): Rect {
  const cs = boxCorners(b);
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function hitTestBox(b: Box, p: Point, tolerance = 0): boolean {
  const l = worldToLocal(b, p);
  return (
    l.x >= -tolerance && l.x <= b.width + tolerance && l.y >= -tolerance && l.y <= b.height + tolerance
  );
}

/** Document point -> pixel coordinates inside the layer's source bitmap. */
export function docToAssetPoint(layer: ImageLayer, p: Point): Point {
  const l = worldToLocal(layer, p);
  const lx = layer.flipX ? layer.width - l.x : l.x;
  const ly = layer.flipY ? layer.height - l.y : l.y;
  return {
    x: (lx * layer.naturalWidth) / layer.width,
    y: (ly * layer.naturalHeight) / layer.height,
  };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_VECTORS: Record<HandleId, { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }> = {
  nw: { sx: -1, sy: -1 },
  n: { sx: 0, sy: -1 },
  ne: { sx: 1, sy: -1 },
  e: { sx: 1, sy: 0 },
  se: { sx: 1, sy: 1 },
  s: { sx: 0, sy: 1 },
  sw: { sx: -1, sy: 1 },
  w: { sx: -1, sy: 0 },
};

export const ALL_HANDLES = Object.keys(HANDLE_VECTORS) as HandleId[];

/**
 * Resize a (possibly rotated) box by dragging one of its handles. The opposite
 * edge / corner stays fixed in world space. `uniform` keeps the aspect ratio
 * (corner handles only).
 */
export function resizeFromHandle(
  b: Box,
  handle: HandleId,
  pointer: Point,
  uniform: boolean,
  minSize = 4,
): Pick<Box, 'x' | 'y' | 'width' | 'height'> {
  const { sx, sy } = HANDLE_VECTORS[handle];
  const local = worldToLocal(b, pointer);

  let newW = sx === 0 ? b.width : Math.max(minSize, sx > 0 ? local.x : b.width - local.x);
  let newH = sy === 0 ? b.height : Math.max(minSize, sy > 0 ? local.y : b.height - local.y);

  if (uniform && sx !== 0 && sy !== 0) {
    const k = Math.max(newW / b.width, newH / b.height);
    newW = Math.max(minSize, b.width * k);
    newH = Math.max(minSize, b.height * k);
  }

  const x0 = sx > 0 ? 0 : sx < 0 ? b.width - newW : 0;
  const y0 = sy > 0 ? 0 : sy < 0 ? b.height - newH : 0;
  const localCenter = { x: x0 + newW / 2, y: y0 + newH / 2 };
  const worldCenter = localToWorld(b, localCenter);
  return { x: worldCenter.x - newW / 2, y: worldCenter.y - newH / 2, width: newW, height: newH };
}

/** Rotation (degrees) so that the rotate handle above the box points at `pointer`. */
export function rotationFromPointer(b: Box, pointer: Point, snap15: boolean): number {
  const c = boxCenter(b);
  let deg = toDeg(Math.atan2(pointer.y - c.y, pointer.x - c.x)) + 90;
  if (snap15) deg = Math.round(deg / 15) * 15;
  return normalizeAngle(deg);
}

export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function clampRectToSize(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(w, r.x));
  const y = Math.max(0, Math.min(h, r.y));
  const x2 = Math.max(0, Math.min(w, r.x + r.width));
  const y2 = Math.max(0, Math.min(h, r.y + r.height));
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Largest scale that fits (contain) or covers (cover) a source in a box. */
export function fitScale(srcW: number, srcH: number, boxW: number, boxH: number, mode: 'contain' | 'cover'): number {
  const sx = boxW / srcW;
  const sy = boxH / srcH;
  return mode === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
}
