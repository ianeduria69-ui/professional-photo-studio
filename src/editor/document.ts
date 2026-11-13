import {
  DEFAULT_ADJUSTMENTS,
  type DocumentModel,
  type Guide,
  type ImageLayer,
  type Layer,
  type LayerBase,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
} from '../types';
import { uid } from '../utils/id';
import { normalizeAngle, type Rect } from '../utils/geometry';

export const DOC_VERSION = 1;

export interface NewDocumentOptions {
  name?: string;
  width: number;
  height: number;
  dpi?: number;
  backgroundColor?: string;
  transparent?: boolean;
}

export function createDocument(o: NewDocumentOptions): DocumentModel {
  return {
    version: DOC_VERSION,
    id: uid('doc'),
    name: o.name ?? 'Untitled',
    width: Math.max(1, Math.round(o.width)),
    height: Math.max(1, Math.round(o.height)),
    dpi: o.dpi ?? 300,
    background: { transparent: o.transparent ?? false, color: o.backgroundColor ?? '#ffffff' },
    layers: [],
    assets: {},
    guides: [],
  };
}

function baseProps(name: string, box: Pick<LayerBase, 'x' | 'y' | 'width' | 'height'>): LayerBase {
  return {
    id: uid('layer'),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    shadow: { enabled: false, color: '#000000', blur: 12, offsetX: 4, offsetY: 4 },
    border: { enabled: false, color: '#000000', width: 4 },
  };
}

export interface ImageLayerArgs {
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function createImageLayer(a: ImageLayerArgs): ImageLayer {
  return {
    ...baseProps(a.name ?? 'Image', {
      x: a.x ?? 0,
      y: a.y ?? 0,
      width: a.width ?? a.naturalWidth,
      height: a.height ?? a.naturalHeight,
    }),
    kind: 'image',
    assetId: a.assetId,
    naturalWidth: a.naturalWidth,
    naturalHeight: a.naturalHeight,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  };
}

export function createTextLayer(a: Partial<Omit<TextLayer, 'kind'>> = {}): TextLayer {
  const fontSize = a.fontSize ?? 64;
  return {
    ...baseProps(a.name ?? 'Text', {
      x: a.x ?? 0,
      y: a.y ?? 0,
      width: a.width ?? 600,
      height: a.height ?? fontSize * (a.lineHeight ?? 1.2),
    }),
    ...a,
    kind: 'text',
    text: a.text ?? 'Your text here',
    fontFamily: a.fontFamily ?? 'Arial',
    fontSize,
    bold: a.bold ?? false,
    italic: a.italic ?? false,
    color: a.color ?? '#111111',
    align: a.align ?? 'left',
    lineHeight: a.lineHeight ?? 1.2,
  };
}

export function createShapeLayer(shape: ShapeKind, a: Partial<Omit<ShapeLayer, 'kind' | 'shape'>> = {}): ShapeLayer {
  const label = shape === 'rect' ? 'Rectangle' : shape === 'ellipse' ? 'Ellipse' : 'Line';
  const strokeWidth = a.strokeWidth ?? (shape === 'line' ? 6 : 0);
  return {
    ...baseProps(a.name ?? label, {
      x: a.x ?? 0,
      y: a.y ?? 0,
      width: a.width ?? 300,
      height: a.height ?? (shape === 'line' ? Math.max(strokeWidth, 2) : 300),
    }),
    ...a,
    kind: 'shape',
    shape,
    fill: a.fill === undefined ? (shape === 'line' ? null : '#2d6cdf') : a.fill,
    stroke: a.stroke === undefined ? (shape === 'line' ? '#111111' : null) : a.stroke,
    strokeWidth,
    cornerRadius: a.cornerRadius ?? 0,
  };
}

export function getLayer(doc: DocumentModel, id: string | null): Layer | undefined {
  if (!id) return undefined;
  return doc.layers.find((l) => l.id === id);
}

export function addAsset(doc: DocumentModel, dataUrl: string): { doc: DocumentModel; assetId: string } {
  const assetId = uid('asset');
  return { doc: { ...doc, assets: { ...doc.assets, [assetId]: dataUrl } }, assetId };
}

export function nextLayerName(doc: DocumentModel, base: string): string {
  const names = new Set(doc.layers.map((l) => l.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function addLayer(doc: DocumentModel, layer: Layer, atIndex?: number): DocumentModel {
  const layers = doc.layers.slice();
  const i = atIndex === undefined ? layers.length : Math.max(0, Math.min(layers.length, atIndex));
  layers.splice(i, 0, layer);
  return { ...doc, layers };
}

export function removeLayer(doc: DocumentModel, id: string): DocumentModel {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function updateLayer(doc: DocumentModel, id: string, patch: Partial<Layer>): DocumentModel {
  let changed = false;
  const layers = doc.layers.map((l) => {
    if (l.id !== id) return l;
    changed = true;
    return { ...l, ...patch } as Layer;
  });
  return changed ? { ...doc, layers } : doc;
}

export function duplicateLayer(doc: DocumentModel, id: string): { doc: DocumentModel; newId: string | null } {
  const index = doc.layers.findIndex((l) => l.id === id);
  if (index < 0) return { doc, newId: null };
  const src = doc.layers[index];
  const copy: Layer = {
    ...src,
    id: uid('layer'),
    name: nextLayerName(doc, `${src.name} copy`),
    x: src.x + 20,
    y: src.y + 20,
    shadow: { ...src.shadow },
    border: { ...src.border },
    ...(src.kind === 'image' ? { adjustments: { ...src.adjustments } } : {}),
  } as Layer;
  return { doc: addLayer(doc, copy, index + 1), newId: copy.id };
}

export type MoveDirection = 'up' | 'down' | 'top' | 'bottom';

export function moveLayer(doc: DocumentModel, id: string, dir: MoveDirection): DocumentModel {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return doc;
  const last = doc.layers.length - 1;
  const to = dir === 'up' ? from + 1 : dir === 'down' ? from - 1 : dir === 'top' ? last : 0;
  return reorderLayer(doc, id, to);
}

/** Move a layer to an absolute stack index (0 = bottom). */
export function reorderLayer(doc: DocumentModel, id: string, toIndex: number): DocumentModel {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(doc.layers.length - 1, toIndex));
  if (from === to) return doc;
  const layers = doc.layers.slice();
  const [item] = layers.splice(from, 1);
  layers.splice(to, 0, item);
  return { ...doc, layers };
}

function mapGuides(guides: Guide[], fn: (g: Guide) => Guide | null): Guide[] {
  return guides.map(fn).filter((g): g is Guide => g !== null);
}

/** Rotate the whole canvas by 90 degrees (all layers and guides follow). */
export function rotateCanvas90(doc: DocumentModel, clockwise: boolean): DocumentModel {
  const W = doc.width;
  const H = doc.height;
  const layers = doc.layers.map((l) => {
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const n = clockwise ? { x: H - cy, y: cx } : { x: cy, y: W - cx };
    return {
      ...l,
      x: n.x - l.width / 2,
      y: n.y - l.height / 2,
      rotation: normalizeAngle(l.rotation + (clockwise ? 90 : -90)),
    } as Layer;
  });
  const guides = mapGuides(doc.guides, (g) => {
    if (g.orientation === 'v') {
      // vertical line x=p  ->  horizontal line
      return { ...g, orientation: 'h', position: clockwise ? g.position : W - g.position };
    }
    return { ...g, orientation: 'v', position: clockwise ? H - g.position : g.position };
  });
  return { ...doc, width: H, height: W, layers, guides };
}

export function flipCanvas(doc: DocumentModel, axis: 'h' | 'v'): DocumentModel {
  const layers = doc.layers.map((l) => {
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    return {
      ...l,
      x: axis === 'h' ? doc.width - cx - l.width / 2 : l.x,
      y: axis === 'v' ? doc.height - cy - l.height / 2 : l.y,
      rotation: normalizeAngle(-l.rotation),
      flipX: axis === 'h' ? !l.flipX : l.flipX,
      flipY: axis === 'v' ? !l.flipY : l.flipY,
    } as Layer;
  });
  const guides = mapGuides(doc.guides, (g) => {
    if (axis === 'h' && g.orientation === 'v') return { ...g, position: doc.width - g.position };
    if (axis === 'v' && g.orientation === 'h') return { ...g, position: doc.height - g.position };
    return g;
  });
  return { ...doc, layers, guides };
}

/** Scale the entire document (canvas + every layer) to a new pixel size. */
export function resizeImage(doc: DocumentModel, width: number, height: number): DocumentModel {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const sx = w / doc.width;
  const sy = h / doc.height;
  const layers = doc.layers.map((l) => {
    const scaled = { ...l, x: l.x * sx, y: l.y * sy, width: l.width * sx, height: l.height * sy } as Layer;
    if (scaled.kind === 'text') scaled.fontSize = Math.max(1, scaled.fontSize * Math.min(sx, sy));
    if (scaled.kind === 'shape') {
      scaled.strokeWidth *= Math.min(sx, sy);
      scaled.cornerRadius *= Math.min(sx, sy);
    }
    return scaled;
  });
  const guides = doc.guides.map((g) => ({ ...g, position: g.position * (g.orientation === 'v' ? sx : sy) }));
  return { ...doc, width: w, height: h, layers, guides };
}

/** Change the canvas size without scaling layers. Content is centred or pinned top-left. */
export function resizeCanvas(
  doc: DocumentModel,
  width: number,
  height: number,
  anchor: 'center' | 'topleft' = 'center',
): DocumentModel {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const dx = anchor === 'center' ? Math.round((w - doc.width) / 2) : 0;
  const dy = anchor === 'center' ? Math.round((h - doc.height) / 2) : 0;
  return {
    ...doc,
    width: w,
    height: h,
    layers: doc.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }) as Layer),
    guides: doc.guides.map((g) => ({ ...g, position: g.position + (g.orientation === 'v' ? dx : dy) })),
  };
}

/** Crop the canvas to `rect` (document pixels). */
export function cropCanvas(doc: DocumentModel, rect: Rect): DocumentModel {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  return {
    ...doc,
    width: w,
    height: h,
    layers: doc.layers.map((l) => ({ ...l, x: l.x - x, y: l.y - y }) as Layer),
    guides: doc.guides
      .map((g) => ({ ...g, position: g.position - (g.orientation === 'v' ? x : y) }))
      .filter((g) => g.position >= 0 && g.position <= (g.orientation === 'v' ? w : h)),
  };
}

/** Remove assets that no layer references any more (used when saving). */
export function pruneAssets(doc: DocumentModel): DocumentModel {
  const used = new Set<string>();
  for (const l of doc.layers) {
    if (l.kind === 'image') {
      used.add(l.assetId);
      if (l.originalAssetId) used.add(l.originalAssetId);
    }
  }
  const ids = Object.keys(doc.assets);
  if (ids.every((id) => used.has(id))) return doc;
  const assets: Record<string, string> = {};
  for (const id of ids) if (used.has(id)) assets[id] = doc.assets[id];
  return { ...doc, assets };
}

export function addGuide(doc: DocumentModel, orientation: 'h' | 'v', position: number): DocumentModel {
  return { ...doc, guides: [...doc.guides, { id: uid('guide'), orientation, position }] };
}

export function physicalSizeInches(doc: Pick<DocumentModel, 'width' | 'height' | 'dpi'>): { width: number; height: number } {
  return { width: doc.width / doc.dpi, height: doc.height / doc.dpi };
}
