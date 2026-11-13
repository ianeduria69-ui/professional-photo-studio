import type { Rect } from '../utils/geometry';

export interface SnapTargets {
  /** x positions of vertical lines */
  v: number[];
  /** y positions of horizontal lines */
  h: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** Lines that were snapped to (for drawing feedback). */
  lines: { orientation: 'h' | 'v'; position: number }[];
}

/**
 * Find the smallest shift that aligns the left/centre/right (and top/middle/bottom)
 * of `box` to a target line, if within `threshold` document pixels.
 */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): SnapResult {
  const xs = [box.x, box.x + box.width / 2, box.x + box.width];
  const ys = [box.y, box.y + box.height / 2, box.y + box.height];
  let bestX: { d: number; line: number } | null = null;
  let bestY: { d: number; line: number } | null = null;

  for (const t of targets.v) {
    for (const x of xs) {
      const d = t - x;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line: t };
    }
  }
  for (const t of targets.h) {
    for (const y of ys) {
      const d = t - y;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line: t };
    }
  }

  const lines: SnapResult['lines'] = [];
  if (bestX) lines.push({ orientation: 'v', position: bestX.line });
  if (bestY) lines.push({ orientation: 'h', position: bestY.line });
  return { dx: bestX?.d ?? 0, dy: bestY?.d ?? 0, lines };
}
