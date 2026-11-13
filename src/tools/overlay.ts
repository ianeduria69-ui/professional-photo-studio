import type { Studio } from '../services/studio';
import { boxCorners, HANDLE_VECTORS, type HandleId, type Point, type Rect } from '../utils/geometry';
import { HANDLE_PX, type ToolController } from './controller';

const ACCENT = '#4c9fff';

function strokeHandle(ctx: CanvasRenderingContext2D, p: Point): void {
  const h = HANDLE_PX;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.fillRect(p.x - h / 2, p.y - h / 2, h, h);
  ctx.strokeRect(p.x - h / 2, p.y - h / 2, h, h);
}

function screenRect(c: ToolController, r: Rect): Rect {
  const a = c.toScreen({ x: r.x, y: r.y });
  const b = c.toScreen({ x: r.x + r.width, y: r.y + r.height });
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

function dashedRect(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000000';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineDashOffset = 5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
  ctx.restore();
}

/** Draws guides, selection frames, crop box and other editing aids in screen space (never exported). */
export function drawToolOverlay(ctx: CanvasRenderingContext2D, studio: Studio, c: ToolController, width: number, height: number): void {
  const st = studio.store.state;
  const doc = studio.store.doc;

  // guides
  if (st.showGuides) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#19d3c5';
    for (const g of doc.guides) {
      ctx.beginPath();
      if (g.orientation === 'v') {
        const x = Math.round(g.position * st.zoom + st.panX) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        const y = Math.round(g.position * st.zoom + st.panY) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // snap feedback
  if (c.snapLines.length) {
    ctx.save();
    ctx.strokeStyle = '#ff3fa4';
    ctx.lineWidth = 1;
    for (const l of c.snapLines) {
      ctx.beginPath();
      if (l.orientation === 'v') {
        const x = Math.round(l.position * st.zoom + st.panX) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      } else {
        const y = Math.round(l.position * st.zoom + st.panY) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // selected layer frame + handles
  const sel = studio.selected;
  if (sel && sel.visible && st.tool !== 'crop') {
    const pts = boxCorners(sel).map((p) => c.toScreen(p));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ACCENT;
    if (sel.locked) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (!sel.locked && st.tool === 'move') {
      const { handles, rotate } = c.handlePositions(sel);
      const topMid = handles.n;
      ctx.beginPath();
      ctx.moveTo(topMid.x, topMid.y);
      ctx.lineTo(rotate.x, rotate.y);
      ctx.stroke();
      (Object.keys(HANDLE_VECTORS) as HandleId[]).forEach((id) => {
        if (sel.kind === 'text' && (id === 'n' || id === 's')) return;
        strokeHandle(ctx, handles[id]);
      });
      ctx.beginPath();
      ctx.arc(rotate.x, rotate.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // rectangular selection (marching-ants style)
  if (st.selection) {
    const r = screenRect(c, st.selection);
    ctx.save();
    ctx.fillStyle = 'rgba(76,159,255,0.10)';
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.restore();
    dashedRect(ctx, r);
  }

  // crop box
  if (st.tool === 'crop' && st.cropRect) {
    const r = screenRect(c, st.cropRect);
    const d = screenRect(c, { x: 0, y: 0, width: doc.width, height: doc.height });
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(d.x, d.y, d.width, d.height);
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    for (let i = 1; i <= 2; i++) {
      ctx.moveTo(r.x + (r.width * i) / 3, r.y);
      ctx.lineTo(r.x + (r.width * i) / 3, r.y + r.height);
      ctx.moveTo(r.x, r.y + (r.height * i) / 3);
      ctx.lineTo(r.x + r.width, r.y + (r.height * i) / 3);
    }
    ctx.stroke();
    (Object.keys(HANDLE_VECTORS) as HandleId[]).forEach((id) => {
      const v = HANDLE_VECTORS[id];
      strokeHandle(ctx, { x: r.x + ((v.sx + 1) / 2) * r.width, y: r.y + ((v.sy + 1) / 2) * r.height });
    });
    ctx.restore();
  }

  // shape being drawn
  if (c.shapePreview) {
    const { shape, a, b } = c.shapePreview;
    const A = c.toScreen(a);
    const B = c.toScreen(b);
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = 'rgba(76,159,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (shape === 'line') {
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
    } else if (shape === 'ellipse') {
      ctx.ellipse((A.x + B.x) / 2, (A.y + B.y) / 2, Math.abs(B.x - A.x) / 2, Math.abs(B.y - A.y) / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y));
    }
    if (shape !== 'line') ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // brush size ring
  if ((st.tool === 'brush' || st.tool === 'eraser') && c.hover && !c.spaceDown) {
    const rad = Math.max(1.5, (st.brush.size / 2) * st.zoom);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(c.hover.sx, c.hover.sy, rad + 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.hover.sx, c.hover.sy, rad - 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
