import { getLayer, updateLayer } from '../editor/document';
import { beginRaster, strokeTo, type RasterSession } from '../editor/raster';
import { renderDocument } from '../editor/renderer';
import { snapBox, type SnapTargets } from '../editor/snapping';
import type { Studio } from '../services/studio';
import type { ImageLayer, Layer, ShapeKind, ToolId } from '../types';
import { rgbToHex } from '../utils/color';
import {
  boxBounds,
  clampRectToSize,
  hitTestBox,
  HANDLE_VECTORS,
  localToWorld,
  normalizeRect,
  resizeFromHandle,
  rotationFromPointer,
  type HandleId,
  type Point,
  type Rect,
} from '../utils/geometry';
import { uid } from '../utils/id';

export interface PointerInfo {
  /** Position inside the workspace viewport (CSS px). */
  sx: number;
  sy: number;
  /** Position in document pixels. */
  x: number;
  y: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  button: number;
}

export const HANDLE_PX = 9;
const HIT_PX = 7;
export const ROTATE_OFFSET_PX = 30;

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; id: string; startX: number; startY: number; origin: Layer }
  | { kind: 'resize'; id: string; handle: HandleId; origin: Layer }
  | { kind: 'rotate'; id: string; origin: Layer }
  | { kind: 'guide'; id: string }
  | { kind: 'marquee'; start: Point }
  | { kind: 'crop-new'; start: Point }
  | { kind: 'crop-move'; startX: number; startY: number; origin: Rect }
  | { kind: 'crop-resize'; handle: HandleId; origin: Rect }
  | { kind: 'shape'; start: Point; shape: ShapeKind }
  | { kind: 'paint'; mode: 'paint' | 'erase'; session: RasterSession | null; layerId: string; pending: Point[]; ended: boolean };

export interface ShapePreview {
  shape: ShapeKind;
  a: Point;
  b: Point;
}

/**
 * Turns pointer input into editing actions for the active tool. It owns only the
 * short-lived state of a drag; everything that is saved lives in the Studio / store.
 */
export class ToolController {
  private gesture: Gesture | null = null;
  snapLines: { orientation: 'h' | 'v'; position: number }[] = [];
  shapePreview: ShapePreview | null = null;
  hover: { sx: number; sy: number } | null = null;
  spaceDown = false;
  cursor = 'default';

  constructor(private readonly studio: Studio) {}

  private get store() {
    return this.studio.store;
  }

  get active(): boolean {
    return this.gesture !== null;
  }

  // ------------------------------------------------------------ coordinate helpers
  toDoc(sx: number, sy: number): Point {
    const s = this.store.state;
    return { x: (sx - s.panX) / s.zoom, y: (sy - s.panY) / s.zoom };
  }

  toScreen(p: Point): Point {
    const s = this.store.state;
    return { x: p.x * s.zoom + s.panX, y: p.y * s.zoom + s.panY };
  }

  /** Screen positions of the 8 resize handles and the rotate handle of a layer. */
  handlePositions(l: Layer): { handles: Record<HandleId, Point>; rotate: Point } {
    const z = this.store.state.zoom;
    const handles = {} as Record<HandleId, Point>;
    (Object.keys(HANDLE_VECTORS) as HandleId[]).forEach((id) => {
      const v = HANDLE_VECTORS[id];
      handles[id] = this.toScreen(localToWorld(l, { x: ((v.sx + 1) / 2) * l.width, y: ((v.sy + 1) / 2) * l.height }));
    });
    const rotate = this.toScreen(localToWorld(l, { x: l.width / 2, y: -ROTATE_OFFSET_PX / z }));
    return { handles, rotate };
  }

  private hitHandle(info: PointerInfo, l: Layer): HandleId | 'rotate' | null {
    const { handles, rotate } = this.handlePositions(l);
    if (Math.hypot(info.sx - rotate.x, info.sy - rotate.y) <= HIT_PX + 2) return 'rotate';
    let best: HandleId | null = null;
    let bestD = HIT_PX + 1;
    (Object.keys(handles) as HandleId[]).forEach((id) => {
      if (l.kind === 'text' && (id === 'n' || id === 's')) return;
      const d = Math.max(Math.abs(info.sx - handles[id].x), Math.abs(info.sy - handles[id].y));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  hitLayer(p: Point): Layer | undefined {
    const tol = 4 / this.store.state.zoom;
    const layers = this.store.doc.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.visible) continue;
      const lineTol = l.kind === 'shape' && l.shape === 'line' ? Math.max(tol, 8 / this.store.state.zoom) : tol;
      if (hitTestBox(l, p, lineTol)) return l;
    }
    return undefined;
  }

  private findGuide(info: PointerInfo): string | null {
    const s = this.store.state;
    if (!s.showGuides) return null;
    for (const g of this.store.doc.guides) {
      const pos = g.orientation === 'v' ? g.position * s.zoom + s.panX : g.position * s.zoom + s.panY;
      const cur = g.orientation === 'v' ? info.sx : info.sy;
      if (Math.abs(pos - cur) <= 4) return g.id;
    }
    return null;
  }

  private cropHandleAt(info: PointerInfo, r: Rect): HandleId | null {
    const box = { ...r, rotation: 0 };
    let best: HandleId | null = null;
    let bestD = HIT_PX + 2;
    (Object.keys(HANDLE_VECTORS) as HandleId[]).forEach((id) => {
      const v = HANDLE_VECTORS[id];
      const p = this.toScreen({ x: box.x + ((v.sx + 1) / 2) * box.width, y: box.y + ((v.sy + 1) / 2) * box.height });
      const d = Math.max(Math.abs(info.sx - p.x), Math.abs(info.sy - p.y));
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  private snapTargets(excludeId: string): SnapTargets {
    const d = this.store.doc;
    const v = [0, d.width / 2, d.width];
    const h = [0, d.height / 2, d.height];
    for (const g of d.guides) (g.orientation === 'v' ? v : h).push(g.position);
    for (const l of d.layers) {
      if (l.id === excludeId || !l.visible) continue;
      const b = boxBounds(l);
      v.push(b.x, b.x + b.width / 2, b.x + b.width);
      h.push(b.y, b.y + b.height / 2, b.y + b.height);
    }
    return { v, h };
  }

  // ------------------------------------------------------------ cursor feedback
  private cursorForHandle(h: HandleId | 'rotate'): string {
    if (h === 'rotate') return 'grab';
    if (h === 'n' || h === 's') return 'ns-resize';
    if (h === 'e' || h === 'w') return 'ew-resize';
    return h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';
  }

  private updateCursor(info: PointerInfo): void {
    const s = this.store.state;
    let c = 'default';
    if (this.spaceDown) c = 'grab';
    else {
      switch (s.tool) {
        case 'move': {
          const sel = this.studio.selected;
          const h = sel && !sel.locked && sel.visible ? this.hitHandle(info, sel) : null;
          if (h) c = this.cursorForHandle(h);
          else if (this.findGuide(info)) c = 'move';
          else c = this.hitLayer(this.toDoc(info.sx, info.sy)) ? 'move' : 'default';
          break;
        }
        case 'crop': {
          const r = s.cropRect;
          const h = r ? this.cropHandleAt(info, r) : null;
          c = h ? this.cursorForHandle(h) : r && this.inside(r, this.toDoc(info.sx, info.sy)) ? 'move' : 'crosshair';
          break;
        }
        case 'text':
          c = 'text';
          break;
        case 'picker':
        case 'brush':
        case 'eraser':
        case 'select':
        case 'shape':
        case 'bgremove':
          c = 'crosshair';
          break;
      }
    }
    this.cursor = c;
  }

  private inside(r: Rect, p: Point): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  }

  // ------------------------------------------------------------ pointer events
  pointerDown(info: PointerInfo): void {
    if (this.store.state.busy) return;
    if (this.spaceDown || info.button === 1) {
      const s = this.store.state;
      this.gesture = { kind: 'pan', sx: info.sx, sy: info.sy, panX: s.panX, panY: s.panY };
      this.cursor = 'grabbing';
      return;
    }
    if (info.button !== 0) return;
    const tool: ToolId = this.store.state.tool;
    const p: Point = { x: info.x, y: info.y };
    switch (tool) {
      case 'move':
        return this.downMove(info, p);
      case 'select':
        this.gesture = { kind: 'marquee', start: this.clampPoint(p) };
        this.store.set({ selection: null });
        return;
      case 'crop':
        return this.downCrop(info, p);
      case 'brush':
        void this.beginPaint(p, 'paint');
        return;
      case 'eraser':
        void this.beginPaint(p, 'erase');
        return;
      case 'text': {
        const hit = this.hitLayer(p);
        if (hit && hit.kind === 'text') {
          this.store.select(hit.id);
          this.store.set({ tool: 'move' });
          this.studio.addTextFocus();
        } else {
          this.studio.addText(p);
        }
        return;
      }
      case 'shape':
        this.gesture = { kind: 'shape', start: p, shape: this.store.state.shapeKind };
        this.shapePreview = { shape: this.store.state.shapeKind, a: p, b: p };
        return;
      case 'picker':
        this.pick(p, info.alt || info.shift);
        return;
      case 'bgremove':
        void this.studio.magicEraseAt(p);
        return;
    }
  }

  private clampPoint(p: Point): Point {
    const d = this.store.doc;
    return { x: Math.max(0, Math.min(d.width, p.x)), y: Math.max(0, Math.min(d.height, p.y)) };
  }

  private downMove(info: PointerInfo, p: Point): void {
    const sel = this.studio.selected;
    if (sel && sel.visible && !sel.locked) {
      const h = this.hitHandle(info, sel);
      if (h === 'rotate') {
        this.gesture = { kind: 'rotate', id: sel.id, origin: sel };
        return;
      }
      if (h) {
        this.gesture = { kind: 'resize', id: sel.id, handle: h, origin: sel };
        return;
      }
    }
    const guide = this.findGuide(info);
    if (guide) {
      this.gesture = { kind: 'guide', id: guide };
      return;
    }
    const hit = this.hitLayer(p);
    if (!hit) {
      this.store.select(null);
      return;
    }
    this.store.select(hit.id);
    if (!hit.locked) this.gesture = { kind: 'move', id: hit.id, startX: p.x, startY: p.y, origin: hit };
  }

  private downCrop(info: PointerInfo, p: Point): void {
    const r = this.store.state.cropRect;
    if (r) {
      const h = this.cropHandleAt(info, r);
      if (h) {
        this.gesture = { kind: 'crop-resize', handle: h, origin: r };
        return;
      }
      if (this.inside(r, p)) {
        this.gesture = { kind: 'crop-move', startX: p.x, startY: p.y, origin: r };
        return;
      }
    }
    this.gesture = { kind: 'crop-new', start: this.clampPoint(p) };
    this.store.set({ cropRect: null });
  }

  /** Called by the rulers: start dragging a new guide. */
  beginGuide(orientation: 'h' | 'v', info: PointerInfo): void {
    const id = uid('guide');
    const pos = orientation === 'v' ? info.x : info.y;
    this.store.transient((d) => ({ ...d, guides: [...d.guides, { id, orientation, position: pos }] }));
    this.gesture = { kind: 'guide', id };
  }

  pointerMove(info: PointerInfo): void {
    this.hover = { sx: info.sx, sy: info.sy };
    const g = this.gesture;
    if (!g) {
      this.updateCursor(info);
      return;
    }
    const p: Point = { x: info.x, y: info.y };
    const store = this.store;
    switch (g.kind) {
      case 'pan':
        store.set({ panX: g.panX + (info.sx - g.sx), panY: g.panY + (info.sy - g.sy) });
        break;
      case 'move': {
        let dx = p.x - g.startX;
        let dy = p.y - g.startY;
        if (info.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        this.snapLines = [];
        const o = g.origin;
        if (store.state.snap && !info.alt) {
          const b = boxBounds({ ...o, x: o.x + dx, y: o.y + dy });
          const r = snapBox(b, this.snapTargets(g.id), 6 / store.state.zoom);
          dx += r.dx;
          dy += r.dy;
          this.snapLines = r.lines;
        }
        store.transient((d) => updateLayer(d, g.id, { x: o.x + dx, y: o.y + dy }));
        break;
      }
      case 'resize':
        this.doResize(g, p, info.shift);
        break;
      case 'rotate': {
        const o = g.origin;
        store.transient((d) => updateLayer(d, g.id, { rotation: rotationFromPointer(o, p, info.shift) }));
        break;
      }
      case 'guide': {
        store.transient((d) => ({
          ...d,
          guides: d.guides.map((gd) => (gd.id === g.id ? { ...gd, position: gd.orientation === 'v' ? p.x : p.y } : gd)),
        }));
        break;
      }
      case 'marquee': {
        const r = clampRectToSize(normalizeRect(g.start, this.clampPoint(p)), store.doc.width, store.doc.height);
        store.set({ selection: r });
        break;
      }
      case 'crop-new':
        store.set({ cropRect: this.aspectRect(g.start, this.clampPoint(p)) });
        break;
      case 'crop-move': {
        const d = store.doc;
        const o = g.origin;
        const x = Math.max(0, Math.min(d.width - o.width, o.x + p.x - g.startX));
        const y = Math.max(0, Math.min(d.height - o.height, o.y + p.y - g.startY));
        store.set({ cropRect: { ...o, x, y } });
        break;
      }
      case 'crop-resize': {
        const o = g.origin;
        const uniform = store.state.cropAspect !== null || info.shift;
        const next = resizeFromHandle({ ...o, rotation: 0 }, g.handle, this.clampPoint(p), uniform, 8);
        store.set({ cropRect: clampRectToSize(next, store.doc.width, store.doc.height) });
        break;
      }
      case 'shape':
        this.shapePreview = { shape: g.shape, a: g.start, b: info.shift ? this.constrain(g.start, p, g.shape) : p };
        store.bump();
        break;
      case 'paint':
        if (g.session) {
          this.paintTo(g, p);
        } else {
          g.pending.push(p);
        }
        break;
    }
  }

  private constrain(a: Point, b: Point, shape: ShapeKind): Point {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (shape === 'line') {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      const len = Math.hypot(dx, dy);
      return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    }
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
  }

  private aspectRect(a: Point, b: Point): Rect {
    const ratio = this.store.state.cropAspect;
    if (!ratio) return normalizeRect(a, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let w = Math.abs(dx);
    let h = Math.abs(dy);
    if (w / Math.max(h, 0.0001) > ratio) w = h * ratio;
    else h = w / ratio;
    const d = this.store.doc;
    const x2 = Math.max(0, Math.min(d.width, a.x + Math.sign(dx || 1) * w));
    const y2 = Math.max(0, Math.min(d.height, a.y + Math.sign(dy || 1) * h));
    return normalizeRect(a, { x: x2, y: y2 });
  }

  private doResize(g: Extract<Gesture, { kind: 'resize' }>, p: Point, shift: boolean): void {
    const o = g.origin;
    const corner = g.handle.length === 2;
    const uniform = corner && (o.kind === 'text' || o.kind === 'image' ? !shift : shift);
    const next = resizeFromHandle(o, g.handle, p, uniform, 6);
    if (o.kind === 'text') {
      const k = next.width / o.width;
      this.store.transient((d) =>
        updateLayer(d, g.id, {
          x: next.x,
          y: next.y,
          width: next.width,
          ...(corner ? { fontSize: Math.max(1, Math.round(o.fontSize * k * 10) / 10) } : {}),
        }),
      );
      return;
    }
    this.store.transient((d) => updateLayer(d, g.id, next));
  }

  pointerUp(info: PointerInfo): void {
    const g = this.gesture;
    if (!g) return;
    const store = this.store;
    this.snapLines = [];
    switch (g.kind) {
      case 'paint':
        if (g.session) void this.finishPaint(g);
        else {
          g.ended = true;
          return; // the gesture ends when the paint session is ready
        }
        break;
      case 'guide': {
        const s = this.studio.viewport;
        const out = info.sx < 0 || info.sy < 0 || info.sx > s.width || info.sy > s.height;
        if (out) store.transient((d) => ({ ...d, guides: d.guides.filter((x) => x.id !== g.id) }));
        store.commit();
        break;
      }
      case 'marquee': {
        const r = store.state.selection;
        if (r && (r.width < 2 || r.height < 2)) store.set({ selection: null });
        break;
      }
      case 'crop-new': {
        const r = store.state.cropRect;
        if (r && (r.width < 4 || r.height < 4)) store.set({ cropRect: null });
        break;
      }
      case 'shape':
        this.finishShape(g, { x: info.x, y: info.y }, info.shift);
        break;
      case 'move':
      case 'resize':
      case 'rotate':
        store.commit();
        break;
      default:
        break;
    }
    this.gesture = null;
    this.shapePreview = null;
    store.bump();
  }

  /** Abort the drag in progress (Escape, or the pointer was cancelled). */
  cancel(): void {
    if (!this.gesture) return;
    const g = this.gesture;
    if (g.kind === 'paint' && g.session) void this.finishPaint(g);
    this.gesture = null;
    this.shapePreview = null;
    this.snapLines = [];
    this.store.commit();
    this.store.bump();
  }

  // ------------------------------------------------------------ shapes
  private finishShape(g: Extract<Gesture, { kind: 'shape' }>, end: Point, shift: boolean): void {
    const b = shift ? this.constrain(g.start, end, g.shape) : end;
    const dist = Math.hypot(b.x - g.start.x, b.y - g.start.y);
    const d = this.store.doc;
    const side = Math.round(Math.min(d.width, d.height) * 0.35);
    if (dist < 5 / this.store.state.zoom) {
      if (g.shape === 'line') {
        this.studio.addShape('line', { x: g.start.x - side * 0.75, y: g.start.y - this.studio.defaultStrokeWidth() / 2 });
      } else {
        this.studio.addShape(g.shape, { x: g.start.x - side / 2, y: g.start.y - side / 2, width: side, height: side });
      }
    } else if (g.shape === 'line') {
      const h = Math.max(this.studio.defaultStrokeWidth(), 2);
      const mid = { x: (g.start.x + b.x) / 2, y: (g.start.y + b.y) / 2 };
      const ang = (Math.atan2(b.y - g.start.y, b.x - g.start.x) * 180) / Math.PI;
      this.studio.addShape('line', { x: mid.x - dist / 2, y: mid.y - h / 2, width: dist, height: h, rotation: ang });
    } else {
      const r = normalizeRect(g.start, b);
      this.studio.addShape(g.shape, { x: r.x, y: r.y, width: Math.max(2, r.width), height: Math.max(2, r.height) });
    }
  }

  // ------------------------------------------------------------ colour picker
  private pick(p: Point, toBackground: boolean): void {
    const doc = this.store.doc;
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.translate(-Math.floor(p.x), -Math.floor(p.y));
    renderDocument(ctx, doc, { provider: this.studio.cache, quality: 'preview', drawBackground: true, pixelScale: 1 });
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) {
      this.studio.toast('That spot is transparent, so there is no colour to pick.');
      return;
    }
    const hex = rgbToHex(r, g, b);
    this.store.set(toBackground ? { bg: hex } : { fg: hex });
    this.studio.toast(`${toBackground ? 'Background' : 'Foreground'} colour ${hex.toUpperCase()}`, 'info');
  }

  // ------------------------------------------------------------ brush / eraser
  private async beginPaint(p: Point, mode: 'paint' | 'erase'): Promise<void> {
    const studio = this.studio;
    let layer: Layer | undefined = studio.selected;
    if (!layer || layer.kind !== 'image' || !layer.visible) {
      if (mode === 'erase') {
        studio.toast('Select a picture layer to erase on.');
        return;
      }
    }
    if (layer && layer.locked) {
      studio.toast('That layer is locked.');
      return;
    }
    const g: Extract<Gesture, { kind: 'paint' }> = { kind: 'paint', mode, session: null, layerId: '', pending: [p], ended: false };
    this.gesture = g;
    try {
      if (!layer || layer.kind !== 'image') {
        const id = await studio.addPaintLayer();
        layer = getLayer(this.store.doc, id);
      }
      if (!layer || layer.kind !== 'image') throw new Error('No picture layer to paint on.');
      const src = studio.cache.getSource(layer.assetId) ?? (await studio.cache.loadAsset(layer.assetId));
      const session = beginRaster(layer, src);
      g.layerId = layer.id;
      g.session = session;
      studio.cache.setOverride(layer.id, session.canvas);
      for (const pt of g.pending) this.paintTo(g, pt);
      g.pending = [];
      if (g.ended) await this.finishPaint(g);
    } catch (e) {
      studio.toast(e instanceof Error ? e.message : String(e), 'error');
      this.gesture = null;
    }
  }

  private paintTo(g: Extract<Gesture, { kind: 'paint' }>, p: Point): void {
    const layer = getLayer(this.store.doc, g.layerId);
    if (!g.session || !layer || layer.kind !== 'image') return;
    const st = this.store.state;
    strokeTo(g.session, layer as ImageLayer, p, st.brush, st.fg, g.mode);
    this.store.bump();
  }

  private async finishPaint(g: Extract<Gesture, { kind: 'paint' }>): Promise<void> {
    const session = g.session;
    if (this.gesture === g) this.gesture = null;
    if (!session) return;
    this.store.set({ busy: 'Applying stroke…' });
    try {
      if (session.changed) {
        await this.studio.commitRaster(g.layerId, session.canvas, false);
      }
    } catch (e) {
      this.studio.toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      this.studio.cache.clearOverride(g.layerId);
      this.store.set({ busy: null });
      this.store.bump();
    }
  }
}
