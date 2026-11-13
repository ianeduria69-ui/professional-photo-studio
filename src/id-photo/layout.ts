export interface SheetSettings {
  paperWidthPx: number;
  paperHeightPx: number;
  photoWidthPx: number;
  photoHeightPx: number;
  /** Space between the paper edge and the photos. */
  marginPx: number;
  /** Space between neighbouring photos. */
  gapPx: number;
  /** Number of copies, or 'fill' to use the whole page. */
  copies: number | 'fill';
  /** Try landscape too and use whichever fits more photos. */
  autoRotate: boolean;
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  paperWidthPx: number;
  paperHeightPx: number;
  /** True when the paper was turned to landscape. */
  rotated: boolean;
  cols: number;
  rows: number;
  /** Photos that physically fit on one sheet. */
  capacity: number;
  /** Photos actually placed. */
  count: number;
  /** Requested copies that did not fit. */
  overflow: number;
  placements: Placement[];
}

function gridFor(W: number, H: number, s: SheetSettings): { cols: number; rows: number } {
  const usableW = W - 2 * s.marginPx;
  const usableH = H - 2 * s.marginPx;
  const cols = Math.max(0, Math.floor((usableW + s.gapPx) / (s.photoWidthPx + s.gapPx)));
  const rows = Math.max(0, Math.floor((usableH + s.gapPx) / (s.photoHeightPx + s.gapPx)));
  return { cols, rows };
}

export function computeSheetLayout(s: SheetSettings): SheetLayout {
  const portrait = gridFor(s.paperWidthPx, s.paperHeightPx, s);
  let W = s.paperWidthPx;
  let H = s.paperHeightPx;
  let { cols, rows } = portrait;
  let rotated = false;

  if (s.autoRotate && s.paperWidthPx !== s.paperHeightPx) {
    const land = gridFor(s.paperHeightPx, s.paperWidthPx, s);
    if (land.cols * land.rows > portrait.cols * portrait.rows) {
      W = s.paperHeightPx;
      H = s.paperWidthPx;
      cols = land.cols;
      rows = land.rows;
      rotated = true;
    }
  }

  const capacity = cols * rows;
  const wanted = s.copies === 'fill' ? capacity : Math.max(0, Math.floor(s.copies));
  const count = Math.min(wanted, capacity);
  const usedCols = Math.min(cols, count);
  const usedRows = count === 0 ? 0 : Math.ceil(count / cols);

  const blockW = usedCols * s.photoWidthPx + Math.max(0, usedCols - 1) * s.gapPx;
  const blockH = usedRows * s.photoHeightPx + Math.max(0, usedRows - 1) * s.gapPx;
  const startX = Math.floor((W - blockW) / 2);
  const startY = Math.floor((H - blockH) / 2);

  const placements: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    placements.push({
      x: startX + c * (s.photoWidthPx + s.gapPx),
      y: startY + r * (s.photoHeightPx + s.gapPx),
      width: s.photoWidthPx,
      height: s.photoHeightPx,
    });
  }

  return {
    paperWidthPx: W,
    paperHeightPx: H,
    rotated,
    cols,
    rows,
    capacity,
    count,
    overflow: Math.max(0, wanted - capacity),
    placements,
  };
}

export interface FaceGuide {
  centerX: number;
  headTopY: number;
  chinY: number;
  eyeLineY: number;
  /** Half-width / half-height of the head oval. */
  radiusX: number;
  radiusY: number;
  shoulderY: number;
}

/**
 * Generic head-position guide drawn over the preview only (never exported).
 * It is a rule of thumb (head about two thirds of the frame height), NOT the
 * rule of any specific agency.
 */
export function faceGuide(widthPx: number, heightPx: number): FaceGuide {
  const headTopY = heightPx * 0.12;
  const chinY = heightPx * 0.78;
  const headH = chinY - headTopY;
  return {
    centerX: widthPx / 2,
    headTopY,
    chinY,
    eyeLineY: headTopY + headH * 0.42,
    radiusX: Math.min(widthPx * 0.36, headH * 0.36),
    radiusY: headH / 2,
    shoulderY: heightPx * 0.9,
  };
}
