import type { PixelBuffer } from './adjustments';

export interface RemovalResult {
  ok: boolean;
  reason?: string;
  /** Fraction of pixels made transparent (0..1). */
  removedRatio: number;
}

type RGB3 = [number, number, number];

/** Tolerance slider (0..100) -> RGB distance threshold. */
export function toleranceToDistance(tolerance: number): number {
  return Math.max(1, (tolerance / 100) * 150);
}

function dist(d: Uint8ClampedArray, i: number, ref: RGB3): number {
  const dr = d[i] - ref[0];
  const dg = d[i + 1] - ref[1];
  const db = d[i + 2] - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function median(values: number[]): number {
  const s = Float64Array.from(values).sort();
  return s[Math.floor(s.length / 2)];
}

/** Median colour of the image border and how uniform the border is (0..1). */
export function estimateBorderBackground(img: PixelBuffer, threshold: number): { color: RGB3; uniformity: number } {
  const { data, width: w, height: h } = img;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    idx.push(i);
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  const stepX = Math.max(1, Math.floor(w / 400));
  const stepY = Math.max(1, Math.floor(h / 400));
  for (let x = 0; x < w; x += stepX) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += stepY) {
    push(0, y);
    push(w - 1, y);
  }
  const color: RGB3 = [median(rs), median(gs), median(bs)];
  let near = 0;
  for (const i of idx) if (dist(data, i, color) <= threshold) near++;
  return { color, uniformity: near / idx.length };
}

/** Flood fill (4-connected) from `seeds`, accepting pixels within `threshold` of `ref`. */
function floodMask(img: PixelBuffer, seeds: number[], ref: RGB3, threshold: number): Uint8Array {
  const { data, width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const s of seeds) {
    if (!mask[s] && dist(data, s * 4, ref) <= threshold) {
      mask[s] = 1;
      queue[tail++] = s;
    }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryPush(p - 1);
    if (x < w - 1) tryPush(p + 1);
    if (y > 0) tryPush(p - w);
    if (y < h - 1) tryPush(p + w);
  }
  return mask;

  function tryPush(n: number) {
    if (!mask[n] && dist(data, n * 4, ref) <= threshold) {
      mask[n] = 1;
      queue[tail++] = n;
    }
  }
}

/** Make masked pixels transparent and soften the one-pixel fringe next to them. */
function applyMask(img: PixelBuffer, mask: Uint8Array, ref: RGB3, threshold: number): number {
  const { data, width: w, height: h } = img;
  const hi = threshold * 1.6;
  let removed = 0;
  const fringe: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) {
      data[p * 4 + 3] = 0;
      removed++;
      continue;
    }
    const x = p % w;
    const y = (p - x) / w;
    if (
      (x > 0 && mask[p - 1]) ||
      (x < w - 1 && mask[p + 1]) ||
      (y > 0 && mask[p - w]) ||
      (y < h - 1 && mask[p + w])
    ) {
      fringe.push(p);
    }
  }
  for (const p of fringe) {
    const d = dist(data, p * 4, ref);
    if (d < hi) {
      const t = Math.max(0, Math.min(1, (d - threshold) / (hi - threshold)));
      const smooth = t * t * (3 - 2 * t);
      data[p * 4 + 3] = Math.round(data[p * 4 + 3] * smooth);
    }
  }
  return removed;
}

/**
 * Remove a plain / uniform background by flood-filling inwards from the image
 * border. Honest about its limits: if the border is not roughly one colour it
 * refuses instead of producing a bad cut-out.
 */
export function removePlainBackground(img: PixelBuffer, tolerance: number): RemovalResult {
  const { width: w, height: h } = img;
  const threshold = toleranceToDistance(tolerance);
  const { color, uniformity } = estimateBorderBackground(img, threshold);
  if (uniformity < 0.6) {
    return {
      ok: false,
      removedRatio: 0,
      reason:
        'The background is not a single plain colour, so the built-in remover cannot cut it out reliably. ' +
        'Try a higher tolerance, the AI remover, or the click-to-erase tool.',
    };
  }
  const seeds: number[] = [];
  for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) seeds.push(y * w, y * w + (w - 1));
  const mask = floodMask(img, seeds, color, threshold);
  const removed = applyMask(img, mask, color, threshold);
  const ratio = removed / (w * h);
  if (ratio > 0.97) {
    return {
      ok: false,
      removedRatio: ratio,
      reason: 'Almost the whole picture was removed. Lower the tolerance and try again.',
    };
  }
  return { ok: true, removedRatio: ratio };
}

/** Magic-eraser: erase the connected region of similar colour around (x, y). */
export function eraseSimilarFromPoint(img: PixelBuffer, x: number, y: number, tolerance: number): RemovalResult {
  const { data, width: w, height: h } = img;
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= w || py >= h) return { ok: false, removedRatio: 0, reason: 'Click inside the image.' };
  const i = (py * w + px) * 4;
  if (data[i + 3] === 0) return { ok: false, removedRatio: 0, reason: 'That area is already transparent.' };
  const ref: RGB3 = [data[i], data[i + 1], data[i + 2]];
  const threshold = toleranceToDistance(tolerance);
  const mask = floodMask(img, [py * w + px], ref, threshold);
  const removed = applyMask(img, mask, ref, threshold);
  return { ok: true, removedRatio: removed / (w * h) };
}
