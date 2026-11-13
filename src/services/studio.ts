import { ImageCache } from '../editor/imageCache';
import {
  addAsset,
  addGuide,
  addLayer,
  createDocument,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  cropCanvas,
  duplicateLayer,
  flipCanvas,
  getLayer,
  moveLayer,
  nextLayerName,
  removeLayer,
  reorderLayer,
  resizeCanvas,
  resizeImage,
  rotateCanvas90,
  updateLayer,
  type MoveDirection,
  type NewDocumentOptions,
} from '../editor/document';
import { renderDocument } from '../editor/renderer';
import { beginRaster, getPixels, putPixels } from '../editor/raster';
import { EditorStore } from '../editor/store';
import { measureText } from '../editor/textMeasure';
import { canvasToBlob, exportDocument, type ExportOptions, type ExportResult } from '../export/exporter';
import { eraseSimilarFromPoint, removePlainBackground } from '../image-processing/backgroundRemoval';
import { AiBackgroundUnavailableError, removeBackgroundAI } from '../image-processing/backgroundAI';
import { parseProject, projectFileName, serializeProject } from '../project/format';
import { loadPrefs, savePrefs } from '../project/prefs';
import { browserRepositories, type ProjectRepository, type TemplateRepository } from '../project/storage';
import { builtinById } from '../templates/builtin';
import type { Adjustments, DocumentModel, DocBackground, Layer, ShapeKind } from '../types';
import { clamp } from '../utils/color';
import { docToAssetPoint, fitScale, type Point, type Rect } from '../utils/geometry';
import { uid } from '../utils/id';
import { downloadBlob, importImageFile, loadImage, readFileAsDataUrl } from './files';
import { ui } from './ui';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * One editing session: the document store, the picture cache and every action the
 * UI can trigger. React components only call these methods, so the editing logic
 * stays testable and independent of the interface.
 */
export class Studio {
  readonly store: EditorStore;
  readonly cache: ImageCache;
  viewport = { width: 900, height: 600 };
  private repos: { projects: ProjectRepository; templates: TemplateRepository } | null = null;
  private cursorText = '';
  private readonly cursorListeners = new Set<() => void>();
  private unsubscribePrefs: (() => void) | null = null;

  constructor(doc?: DocumentModel, options: { persistPrefs?: boolean } = {}) {
    this.store = new EditorStore(doc, { measure: measureText });
    this.cache = new ImageCache(() => this.store.bump());
    const p = loadPrefs();
    this.store.set({
      fg: p.fg,
      bg: p.bg,
      brush: { size: p.brushSize, hardness: p.brushHardness, opacity: p.brushOpacity },
      showRulers: p.showRulers,
      snap: p.snap,
    });
    if (options.persistPrefs) {
      let last = '';
      this.unsubscribePrefs = this.store.subscribe(() => {
        const s = this.store.getState();
        const key = [s.fg, s.bg, s.brush.size, s.brush.hardness, s.brush.opacity, s.showRulers, s.snap].join('|');
        if (key === last) return;
        last = key;
        savePrefs({
          fg: s.fg,
          bg: s.bg,
          brushSize: s.brush.size,
          brushHardness: s.brush.hardness,
          brushOpacity: s.brush.opacity,
          showRulers: s.showRulers,
          snap: s.snap,
        });
      });
    }
  }

  dispose(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.unsubscribePrefs?.();
    this.cache.dispose();
  }

  get repositories(): { projects: ProjectRepository; templates: TemplateRepository } {
    if (!this.repos) this.repos = browserRepositories();
    return this.repos;
  }

  // ---------------------------------------------------------------- cursor readout
  setCursor(text: string): void {
    if (text === this.cursorText) return;
    this.cursorText = text;
    for (const l of this.cursorListeners) l();
  }
  getCursor = (): string => this.cursorText;
  subscribeCursor = (l: () => void): (() => void) => {
    this.cursorListeners.add(l);
    return () => {
      this.cursorListeners.delete(l);
    };
  };

  // ---------------------------------------------------------------- helpers
  /** Runs a slow action with a busy indicator; errors become toasts instead of crashing the UI. */
  async run<T>(label: string, fn: () => Promise<T> | T): Promise<T | undefined> {
    this.store.set({ busy: label });
    await new Promise((r) => setTimeout(r, 30));
    try {
      return await fn();
    } catch (e) {
      this.store.showToast(errorMessage(e), 'error');
      return undefined;
    } finally {
      this.store.set({ busy: null });
    }
  }

  toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
    this.store.showToast(message, kind);
  }

  get selected(): Layer | undefined {
    return this.store.selectedLayer;
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.store.state.dirty) return true;
    return ui.confirm('Discard unsaved changes?', 'The current document has changes that were not saved. Continue and lose them?', 'Discard changes');
  }

  // ---------------------------------------------------------------- view
  setViewport(width: number, height: number): void {
    this.viewport = { width, height };
  }

  fit(padding = 48): void {
    const { doc } = this.store;
    const vw = Math.max(50, this.viewport.width - padding * 2);
    const vh = Math.max(50, this.viewport.height - padding * 2);
    const z = clamp(Math.min(vw / doc.width, vh / doc.height), MIN_ZOOM, 4);
    this.store.set({
      zoom: z,
      panX: (this.viewport.width - doc.width * z) / 2,
      panY: (this.viewport.height - doc.height * z) / 2,
    });
  }

  zoomAt(zoom: number, sx: number, sy: number): void {
    const s = this.store.state;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const dx = (sx - s.panX) / s.zoom;
    const dy = (sy - s.panY) / s.zoom;
    this.store.set({ zoom: z, panX: sx - dx * z, panY: sy - dy * z });
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.store.state.zoom * factor, this.viewport.width / 2, this.viewport.height / 2);
  }

  actualSize(): void {
    this.zoomAt(1, this.viewport.width / 2, this.viewport.height / 2);
  }

  // ---------------------------------------------------------------- documents
  async newDocument(o: NewDocumentOptions): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    this.store.replaceDocument(createDocument(o));
    this.cache.sync(this.store.doc);
    this.fit();
    return true;
  }

  /** Replaces the document without asking (used by the ID Photo Maker "send to editor"). */
  loadDocument(doc: DocumentModel, meta: { projectId?: string | null; templateId?: string | null; dirty?: boolean } = {}): void {
    this.store.replaceDocument(doc, meta);
    this.cache.sync(this.store.doc);
    this.fit();
  }

  async openProjectFile(file: File): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const doc = await this.run('Opening project…', async () => parseProject(await file.text()));
    if (!doc) return false;
    this.loadDocument(doc);
    this.toast(`Opened "${doc.name}" with ${doc.layers.length} layer(s).`, 'success');
    return true;
  }

  async openImageAsDocument(file: File): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const ok = await this.run('Opening picture…', async () => {
      const imp = await importImageFile(file);
      let doc = createDocument({ name: imp.name, width: imp.width, height: imp.height, dpi: 72, transparent: true });
      const added = addAsset(doc, imp.dataUrl);
      doc = added.doc;
      doc = addLayer(
        doc,
        createImageLayer({ assetId: added.assetId, naturalWidth: imp.width, naturalHeight: imp.height, name: imp.name }),
      );
      this.loadDocument({ ...doc, background: { transparent: false, color: '#ffffff' } });
      return true;
    });
    return ok === true;
  }

  async openStored(id: string): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const doc = await this.run('Opening project…', () => this.repositories.projects.open(id));
    if (!doc) return false;
    this.loadDocument(doc, { projectId: id });
    return true;
  }

  async saveProject(): Promise<void> {
    const { templateId, projectId } = this.store.state;
    await this.run('Saving…', async () => {
      const doc = this.store.doc;
      const thumb = await this.thumbnail(doc);
      if (templateId) {
        await this.repositories.templates.update(templateId, doc, thumb);
        this.store.set({ dirty: false });
        this.toast(`Template "${doc.name}" updated.`, 'success');
        return;
      }
      const rec = await this.repositories.projects.save(doc, projectId, thumb);
      this.store.markSaved(rec.id);
      this.toast(`Saved "${doc.name}" in this browser.`, 'success');
    });
  }

  async saveProjectAs(name: string): Promise<void> {
    this.store.apply((d) => ({ ...d, name }));
    this.store.set({ projectId: null, templateId: null });
    await this.saveProject();
  }

  downloadProject(): void {
    const doc = this.store.doc;
    const blob = new Blob([serializeProject(doc)], { type: 'application/json' });
    downloadBlob(blob, projectFileName(doc));
    this.store.set({ dirty: false });
    this.toast('Editable project file downloaded. Open it later with File > Open Project File.', 'success');
  }

  async saveAsTemplate(category: string, name: string): Promise<void> {
    await this.run('Saving template…', async () => {
      const doc = this.store.doc;
      await this.repositories.templates.save(doc, category, name, await this.thumbnail(doc));
      this.toast(`Template "${name}" saved.`, 'success');
    });
  }

  async newFromBuiltin(id: string): Promise<boolean> {
    const t = builtinById(id);
    if (!t) return false;
    if (!(await this.confirmDiscard())) return false;
    this.loadDocument({ ...t.build(), id: uid('doc') });
    return true;
  }

  async newFromTemplate(id: string, edit: boolean): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const doc = await this.run('Opening template…', () => this.repositories.templates.open(id));
    if (!doc) return false;
    this.loadDocument(edit ? doc : { ...doc, id: uid('doc') }, { templateId: edit ? id : null });
    if (edit) this.toast('Editing a template. File > Save updates the template itself.', 'info');
    return true;
  }

  async thumbnail(doc: DocumentModel, maxSide = 240): Promise<string | undefined> {
    try {
      this.cache.sync(doc);
      await Promise.all(doc.layers.filter((l) => l.kind === 'image').map((l) => (l.kind === 'image' ? this.cache.loadAsset(l.assetId) : null)));
      const k = Math.min(1, maxSide / Math.max(doc.width, doc.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(doc.width * k));
      c.height = Math.max(1, Math.round(doc.height * k));
      const ctx = c.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.scale(k, k);
      renderDocument(ctx, doc, { provider: this.cache, quality: 'preview', drawBackground: true, pixelScale: k });
      return c.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  }

  async exportDoc(opts: ExportOptions): Promise<ExportResult | undefined> {
    return this.run('Exporting…', async () => {
      const result = await exportDocument(this.store.doc, this.cache, opts);
      downloadBlob(result.blob, result.filename);
      this.toast(`Exported ${result.filename} (${result.width} × ${result.height} px at ${result.dpi} DPI).`, 'success');
      return result;
    });
  }

  // ---------------------------------------------------------------- adding things
  async addImageFile(file: File, at?: Point): Promise<void> {
    await this.run('Importing picture…', async () => {
      const imp = await importImageFile(file);
      this.placeImage(imp, at);
    });
  }

  placeImage(imp: { dataUrl: string; width: number; height: number; name: string }, at?: Point): void {
    let newId = '';
    this.store.apply((doc) => {
      const added = addAsset(doc, imp.dataUrl);
      const s = Math.min(1, (doc.width * 0.9) / imp.width, (doc.height * 0.9) / imp.height);
      const w = imp.width * s;
      const h = imp.height * s;
      const layer = createImageLayer({
        assetId: added.assetId,
        naturalWidth: imp.width,
        naturalHeight: imp.height,
        name: nextLayerName(doc, imp.name),
        x: at ? at.x - w / 2 : (doc.width - w) / 2,
        y: at ? at.y - h / 2 : (doc.height - h) / 2,
        width: w,
        height: h,
      });
      newId = layer.id;
      return addLayer(added.doc, layer);
    });
    this.store.select(newId);
    this.store.set({ tool: 'move' });
  }

  addText(at?: Point): string {
    const d = this.store.doc;
    const size = Math.round(Math.max(16, Math.min(d.width, d.height) / 12));
    const width = Math.round(d.width * 0.6);
    const layer = createTextLayer({
      text: 'Your text here',
      fontSize: size,
      width,
      x: at ? Math.max(0, Math.min(d.width - 40, at.x)) : (d.width - width) / 2,
      y: at ? Math.max(0, at.y - size / 2) : d.height / 2 - size,
      color: this.store.state.fg,
      name: nextLayerName(d, 'Text'),
    });
    this.store.apply((doc) => addLayer(doc, layer));
    this.store.select(layer.id);
    this.store.set({ tool: 'move' });
    ui.requestTextFocus();
    return layer.id;
  }

  addTextFocus(): void {
    ui.requestTextFocus();
  }

  defaultStrokeWidth(): number {
    const d = this.store.doc;
    return Math.max(2, Math.round(Math.min(d.width, d.height) / 150));
  }

  addShape(kind: ShapeKind, box?: Partial<Rect> & { rotation?: number }): string {
    const d = this.store.doc;
    const side = Math.round(Math.min(d.width, d.height) * 0.35);
    const fg = this.store.state.fg;
    const strokeW = this.defaultStrokeWidth();
    const base = {
      x: box?.x ?? (d.width - (kind === 'line' ? side * 1.5 : side)) / 2,
      y: box?.y ?? (d.height - (kind === 'line' ? strokeW : side)) / 2,
      width: box?.width ?? (kind === 'line' ? side * 1.5 : side),
      height: box?.height ?? (kind === 'line' ? Math.max(strokeW, 2) : side),
      rotation: box?.rotation ?? 0,
      name: nextLayerName(d, kind === 'rect' ? 'Rectangle' : kind === 'ellipse' ? 'Ellipse' : 'Line'),
    };
    const layer =
      kind === 'line'
        ? createShapeLayer('line', { ...base, stroke: fg, fill: null, strokeWidth: strokeW })
        : createShapeLayer(kind, { ...base, fill: fg });
    this.store.apply((doc) => addLayer(doc, layer));
    this.store.select(layer.id);
    return layer.id;
  }

  /** New empty picture layer the size of the canvas, so the brush has something to paint on. */
  async addPaintLayer(): Promise<string> {
    const d = this.store.doc;
    const c = document.createElement('canvas');
    c.width = d.width;
    c.height = d.height;
    const url = await readFileAsDataUrl(await canvasToBlob(c, 'image/png'));
    let id = '';
    let assetId = '';
    this.store.apply((doc) => {
      const added = addAsset(doc, url);
      assetId = added.assetId;
      const layer = createImageLayer({
        assetId: added.assetId,
        naturalWidth: doc.width,
        naturalHeight: doc.height,
        name: nextLayerName(doc, 'Paint'),
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
      });
      id = layer.id;
      return addLayer(added.doc, layer);
    });
    this.cache.registerSource(assetId, c);
    this.store.select(id);
    return id;
  }

  // ---------------------------------------------------------------- layers
  patchLayer(id: string, patch: Partial<Layer>): void {
    this.store.apply((d) => updateLayer(d, id, patch));
  }

  /** Live (not yet in history) change while a slider or text box is being used. Call store.commit() afterwards. */
  patchLive(id: string, patch: Partial<Layer>): void {
    this.store.transient((d) => updateLayer(d, id, patch));
    this.scheduleCommit();
  }

  private liveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Closes a live edit as one history step shortly after the last change. */
  private scheduleCommit(): void {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      this.store.commit();
    }, 700);
  }

  patchAdjustments(id: string, patch: Partial<Adjustments>, live = true): void {
    const fn = (d: DocumentModel) => {
      const l = getLayer(d, id);
      if (!l || l.kind !== 'image') return d;
      return updateLayer(d, id, { adjustments: { ...l.adjustments, ...patch } });
    };
    if (live) {
      this.store.transient(fn);
      this.scheduleCommit();
    } else this.store.apply(fn);
  }

  deleteLayer(id: string | null = this.store.state.selectedId): void {
    if (!id) return;
    const l = getLayer(this.store.doc, id);
    if (!l) return;
    this.store.apply((d) => removeLayer(d, id), { selectedId: null });
  }

  duplicateSelected(): void {
    const id = this.store.state.selectedId;
    if (!id) return;
    let newId: string | null = null;
    this.store.apply((d) => {
      const r = duplicateLayer(d, id);
      newId = r.newId;
      return r.doc;
    });
    if (newId) this.store.select(newId);
  }

  toggleVisible(id: string): void {
    const l = getLayer(this.store.doc, id);
    if (l) this.patchLayer(id, { visible: !l.visible });
  }

  toggleLock(id: string): void {
    const l = getLayer(this.store.doc, id);
    if (l) this.patchLayer(id, { locked: !l.locked });
  }

  renameLayer(id: string, name: string): void {
    const n = name.trim();
    if (n) this.patchLayer(id, { name: n });
  }

  moveLayerOrder(id: string, dir: MoveDirection): void {
    this.store.apply((d) => moveLayer(d, id, dir));
  }

  reorder(id: string, toIndex: number): void {
    this.store.apply((d) => reorderLayer(d, id, toIndex));
  }

  flipLayer(id: string, axis: 'h' | 'v'): void {
    const l = getLayer(this.store.doc, id);
    if (!l) return;
    this.patchLayer(id, axis === 'h' ? { flipX: !l.flipX } : { flipY: !l.flipY });
  }

  rotateLayer90(id: string, clockwise = true): void {
    const l = getLayer(this.store.doc, id);
    if (!l) return;
    let r = l.rotation + (clockwise ? 90 : -90);
    if (r > 180) r -= 360;
    if (r <= -180) r += 360;
    this.patchLayer(id, { rotation: r });
  }

  fitLayerToCanvas(id: string, mode: 'contain' | 'cover'): void {
    const d = this.store.doc;
    const l = getLayer(d, id);
    if (!l) return;
    const nat = l.kind === 'image' ? { w: l.naturalWidth, h: l.naturalHeight } : { w: l.width, h: l.height };
    const s = fitScale(nat.w, nat.h, d.width, d.height, mode);
    const w = nat.w * s;
    const h = nat.h * s;
    this.patchLayer(id, { width: w, height: h, x: (d.width - w) / 2, y: (d.height - h) / 2, rotation: 0 });
  }

  resetLayerSize(id: string): void {
    const l = getLayer(this.store.doc, id);
    if (!l || l.kind !== 'image') return;
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    this.patchLayer(id, { width: l.naturalWidth, height: l.naturalHeight, x: cx - l.naturalWidth / 2, y: cy - l.naturalHeight / 2 });
  }

  centerLayer(id: string, axis: 'h' | 'v' | 'both' = 'both'): void {
    const d = this.store.doc;
    const l = getLayer(d, id);
    if (!l) return;
    this.patchLayer(id, {
      x: axis === 'v' ? l.x : (d.width - l.width) / 2,
      y: axis === 'h' ? l.y : (d.height - l.height) / 2,
    });
  }

  selectRelative(delta: number): void {
    const { layers } = this.store.doc;
    if (!layers.length) return;
    const i = layers.findIndex((l) => l.id === this.store.state.selectedId);
    const n = i < 0 ? (delta > 0 ? 0 : layers.length - 1) : (i + delta + layers.length) % layers.length;
    this.store.select(layers[n].id);
  }

  nudge(dx: number, dy: number): void {
    const l = this.selected;
    if (!l || l.locked) return;
    this.patchLayer(l.id, { x: l.x + dx, y: l.y + dy });
  }

  // ---------------------------------------------------------------- document level
  setBackground(patch: Partial<DocBackground>): void {
    this.store.apply((d) => ({ ...d, background: { ...d.background, ...patch } }));
  }

  renameDocument(name: string): void {
    const n = name.trim();
    if (n) this.store.apply((d) => ({ ...d, name: n }));
  }

  setDpi(dpi: number): void {
    const v = clamp(Math.round(dpi), 1, 2400);
    this.store.apply((d) => ({ ...d, dpi: v }));
  }

  rotateCanvas(clockwise: boolean): void {
    this.store.apply((d) => rotateCanvas90(d, clockwise));
    this.fit();
  }

  flipCanvasAxis(axis: 'h' | 'v'): void {
    this.store.apply((d) => flipCanvas(d, axis));
  }

  resizeImageTo(w: number, h: number): void {
    this.store.apply((d) => resizeImage(d, w, h));
    this.fit();
  }

  resizeCanvasTo(w: number, h: number, anchor: 'center' | 'topleft'): void {
    this.store.apply((d) => resizeCanvas(d, w, h, anchor));
    this.fit();
  }

  addGuideAt(orientation: 'h' | 'v', position: number): void {
    this.store.apply((d) => addGuide(d, orientation, position));
  }

  clearGuides(): void {
    this.store.apply((d) => ({ ...d, guides: [] }));
  }

  // ---------------------------------------------------------------- selection / crop
  selectAll(): void {
    const d = this.store.doc;
    this.store.set({ selection: { x: 0, y: 0, width: d.width, height: d.height } });
  }

  deselect(): void {
    this.store.set({ selection: null });
  }

  selectLayerBounds(): void {
    const l = this.selected;
    if (!l) return this.toast('Select a layer first.');
    const d = this.store.doc;
    const x = clamp(l.x, 0, d.width);
    const y = clamp(l.y, 0, d.height);
    this.store.set({
      selection: { x, y, width: clamp(l.x + l.width, 0, d.width) - x, height: clamp(l.y + l.height, 0, d.height) - y },
    });
  }

  cropToSelection(): void {
    const r = this.store.state.selection;
    if (!r || r.width < 2 || r.height < 2) return this.toast('Make a selection first (Selection tool).');
    this.store.apply((d) => cropCanvas(d, r), { selection: null });
    this.fit();
  }

  applyCrop(): void {
    const r = this.store.state.cropRect;
    const d = this.store.doc;
    if (!r) return this.toast('Drag on the canvas to draw a crop area first.');
    const x = clamp(r.x, 0, d.width);
    const y = clamp(r.y, 0, d.height);
    const w = clamp(r.x + r.width, 0, d.width) - x;
    const h = clamp(r.y + r.height, 0, d.height) - y;
    if (w < 2 || h < 2) return this.toast('The crop area is too small.');
    this.store.apply((doc) => cropCanvas(doc, { x, y, width: w, height: h }), { cropRect: null, selection: null });
    this.fit();
    this.toast(`Canvas cropped to ${Math.round(w)} × ${Math.round(h)} px.`, 'success');
  }

  cancelCrop(): void {
    this.store.set({ cropRect: null });
  }

  fillSelection(): void {
    const r = this.store.state.selection;
    if (!r || r.width < 1 || r.height < 1) return this.toast('Make a selection first (Selection tool).');
    const layer = createShapeLayer('rect', {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      fill: this.store.state.fg,
      name: nextLayerName(this.store.doc, 'Fill'),
    });
    this.store.apply((d) => addLayer(d, layer));
    this.store.select(layer.id);
  }

  async eraseSelection(): Promise<void> {
    const r = this.store.state.selection;
    const layer = this.selected;
    if (!r) return this.toast('Make a selection first (Selection tool).');
    if (!layer || layer.kind !== 'image') return this.toast('Select a picture layer to erase inside the selection.');
    if (layer.locked) return this.toast('That layer is locked.');
    await this.run('Erasing…', async () => {
      const src = await this.cache.loadAsset(layer.assetId);
      const session = beginRaster(layer, src);
      const pts = [
        docToAssetPoint(layer, { x: r.x, y: r.y }),
        docToAssetPoint(layer, { x: r.x + r.width, y: r.y }),
        docToAssetPoint(layer, { x: r.x + r.width, y: r.y + r.height }),
        docToAssetPoint(layer, { x: r.x, y: r.y + r.height }),
      ];
      session.ctx.save();
      session.ctx.globalCompositeOperation = 'destination-out';
      session.ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? session.ctx.moveTo(p.x, p.y) : session.ctx.lineTo(p.x, p.y)));
      session.ctx.closePath();
      session.ctx.fill();
      session.ctx.restore();
      await this.commitRaster(layer.id, session.canvas, false);
    });
  }

  // ---------------------------------------------------------------- pixel edits and background removal
  /** Stores edited pixels of an image layer as a new picture (one undo step). */
  async commitRaster(layerId: string, canvas: HTMLCanvasElement, markOriginal: boolean): Promise<void> {
    const url = await readFileAsDataUrl(await canvasToBlob(canvas, 'image/png'));
    let newId = '';
    this.store.apply((doc) => {
      const l = getLayer(doc, layerId);
      if (!l || l.kind !== 'image') return doc;
      const added = addAsset(doc, url);
      newId = added.assetId;
      return updateLayer(added.doc, layerId, {
        assetId: added.assetId,
        originalAssetId: markOriginal ? (l.originalAssetId ?? l.assetId) : l.originalAssetId,
      });
    });
    if (newId) this.cache.registerSource(newId, canvas);
  }

  private imageLayerOrToast(): Extract<Layer, { kind: 'image' }> | null {
    const l = this.selected;
    if (!l || l.kind !== 'image') {
      this.toast('Select a picture layer first.');
      return null;
    }
    if (l.locked) {
      this.toast('That layer is locked.');
      return null;
    }
    return l;
  }

  async removePlainBackground(): Promise<void> {
    const layer = this.imageLayerOrToast();
    if (!layer) return;
    await this.run('Removing background…', async () => {
      const src = await this.cache.loadAsset(layer.assetId);
      const session = beginRaster(layer, src);
      const img = getPixels(session);
      const res = removePlainBackground(img, this.store.state.bgTolerance);
      if (!res.ok) {
        ui.alert('Background not removed', res.reason ?? 'The background could not be removed.');
        return;
      }
      putPixels(session, img);
      await this.commitRaster(layer.id, session.canvas, true);
      this.toast(`Background removed (${Math.round(res.removedRatio * 100)}% of the picture is now transparent).`, 'success');
    });
  }

  async removeBackgroundWithAI(): Promise<void> {
    const layer = this.imageLayerOrToast();
    if (!layer) return;
    await this.run('AI background removal (first run downloads the model)…', async () => {
      try {
        const blob = await (await fetch(this.store.doc.assets[layer.assetId])).blob();
        const out = await removeBackgroundAI(blob);
        const img = await loadImage(await readFileAsDataUrl(out));
        const c = document.createElement('canvas');
        c.width = layer.naturalWidth;
        c.height = layer.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available.');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        await this.commitRaster(layer.id, c, true);
        this.toast('Background removed with the AI model.', 'success');
      } catch (e) {
        if (e instanceof AiBackgroundUnavailableError) {
          ui.alert('AI background remover is not installed', e.message);
        } else {
          throw e;
        }
      }
    });
  }

  async magicEraseAt(docPoint: Point): Promise<void> {
    const layer = this.imageLayerOrToast();
    if (!layer) return;
    await this.run('Erasing…', async () => {
      const src = await this.cache.loadAsset(layer.assetId);
      const session = beginRaster(layer, src);
      const p = docToAssetPoint(layer, docPoint);
      const img = getPixels(session);
      const res = eraseSimilarFromPoint(img, p.x, p.y, this.store.state.bgTolerance);
      if (!res.ok) {
        this.toast(res.reason ?? 'Nothing was erased.');
        return;
      }
      putPixels(session, img);
      await this.commitRaster(layer.id, session.canvas, true);
    });
  }

  restoreOriginalPicture(): void {
    const l = this.selected;
    if (!l || l.kind !== 'image' || !l.originalAssetId) return this.toast('This picture has no saved original to restore.');
    const original = l.originalAssetId;
    this.store.apply((d) => updateLayer(d, l.id, { assetId: original, originalAssetId: undefined }));
  }
}
