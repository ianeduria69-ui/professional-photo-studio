import type { DocumentModel, Layer, ShapeKind, ToolId } from '../types';
import type { Rect } from '../utils/geometry';
import { createDocument, pruneAssets } from './document';
import { History } from './history';
import { normalizeTextLayers, type Measure } from './text';

export interface BrushSettings {
  size: number;
  hardness: number; // 0..100
  opacity: number; // 0..100
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface EditorState {
  doc: DocumentModel;
  selectedId: string | null;
  tool: ToolId;
  zoom: number;
  /** Screen offset of the document origin inside the workspace viewport. */
  panX: number;
  panY: number;
  selection: Rect | null;
  cropRect: Rect | null;
  fg: string;
  bg: string;
  brush: BrushSettings;
  shapeKind: ShapeKind;
  showRulers: boolean;
  showGuides: boolean;
  snap: boolean;
  projectId: string | null;
  /** Set while a user template is being edited (File > Save then updates the template). */
  templateId: string | null;
  /** Crop tool aspect ratio (width / height), or null for free. */
  cropAspect: number | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumped when something outside the document changes what should be drawn (e.g. an image finished loading). */
  revision: number;
  toast: Toast | null;
  busy: string | null;
  bgTolerance: number;
}

export class EditorStore {
  private s: EditorState;
  private readonly listeners = new Set<() => void>();
  private readonly history: History<DocumentModel>;
  private pendingBase: DocumentModel | null = null;
  private measure: Measure | null;
  private toastCounter = 0;

  constructor(doc?: DocumentModel, options: { measure?: Measure; historyLimit?: number } = {}) {
    this.measure = options.measure ?? null;
    this.history = new History<DocumentModel>(options.historyLimit ?? 60);
    this.s = {
      doc: doc ?? createDocument({ name: 'Untitled', width: 1200, height: 800, dpi: 72 }),
      selectedId: null,
      tool: 'move',
      zoom: 1,
      panX: 0,
      panY: 0,
      selection: null,
      cropRect: null,
      fg: '#111111',
      bg: '#ffffff',
      brush: { size: 24, hardness: 80, opacity: 100 },
      shapeKind: 'rect',
      showRulers: true,
      showGuides: true,
      snap: true,
      projectId: null,
      templateId: null,
      cropAspect: null,
      dirty: false,
      canUndo: false,
      canRedo: false,
      revision: 0,
      toast: null,
      busy: null,
      bgTolerance: 40,
    };
    if (this.measure) this.s = { ...this.s, doc: normalizeTextLayers(this.s.doc, this.measure) };
  }

  /** Arrow functions so they can be passed straight to useSyncExternalStore. */
  getState = (): EditorState => this.s;

  /** Current state (read-only view for convenience). */
  get state(): EditorState {
    return this.s;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }

  setMeasure(measure: Measure): void {
    this.measure = measure;
    const doc = normalizeTextLayers(this.s.doc, measure);
    if (doc !== this.s.doc) this.set({ doc });
  }

  get doc(): DocumentModel {
    return this.s.doc;
  }

  get selectedLayer(): Layer | undefined {
    return this.s.doc.layers.find((l) => l.id === this.s.selectedId);
  }

  /** Update UI-only state. Never touches history. */
  set(patch: Partial<EditorState>): void {
    this.s = { ...this.s, ...patch };
    this.emit();
  }

  bump(): void {
    this.set({ revision: this.s.revision + 1 });
  }

  private finalize(doc: DocumentModel): DocumentModel {
    return this.measure ? normalizeTextLayers(doc, this.measure) : doc;
  }

  private flags(): Pick<EditorState, 'canUndo' | 'canRedo'> {
    return { canUndo: this.history.canUndo, canRedo: this.history.canRedo };
  }

  /** Apply an undoable change. Any open transient edit is committed first. */
  apply(fn: (doc: DocumentModel) => DocumentModel, patch: Partial<EditorState> = {}): void {
    this.commit();
    const before = this.s.doc;
    // Drop pictures no layer uses any more so the session does not leak memory;
    // older history snapshots keep their own assets, so undo still works.
    const after = pruneAssets(this.finalize(fn(before)));
    if (after === before) {
      if (Object.keys(patch).length) this.set(patch);
      return;
    }
    this.history.push(before);
    this.s = { ...this.s, ...patch, doc: after, dirty: true, ...this.flags() };
    this.emit();
  }

  /** Live (non-history) change, e.g. while dragging. Call commit() when done. */
  transient(fn: (doc: DocumentModel) => DocumentModel): void {
    if (!this.pendingBase) this.pendingBase = this.s.doc;
    this.s = { ...this.s, doc: this.finalize(fn(this.s.doc)), dirty: true };
    this.emit();
  }

  /** Close an open transient edit and record it as a single history step. */
  commit(): void {
    if (!this.pendingBase) return;
    const base = this.pendingBase;
    this.pendingBase = null;
    if (base !== this.s.doc) {
      this.history.push(base);
      this.s = { ...this.s, ...this.flags() };
      this.emit();
    }
  }

  undo(): void {
    this.commit();
    const prev = this.history.undo(this.s.doc);
    if (!prev) return;
    this.restore(prev);
  }

  redo(): void {
    this.commit();
    const next = this.history.redo(this.s.doc);
    if (!next) return;
    this.restore(next);
  }

  private restore(doc: DocumentModel): void {
    const selectedId = doc.layers.some((l) => l.id === this.s.selectedId) ? this.s.selectedId : null;
    this.s = { ...this.s, doc, selectedId, dirty: true, ...this.flags() };
    this.emit();
  }

  /** Replace the whole document (new / open). Resets history. */
  replaceDocument(doc: DocumentModel, meta: { projectId?: string | null; templateId?: string | null; dirty?: boolean } = {}): void {
    this.pendingBase = null;
    this.history.clear();
    this.s = {
      ...this.s,
      doc: this.finalize(doc),
      selectedId: null,
      selection: null,
      cropRect: null,
      projectId: meta.projectId ?? null,
      templateId: meta.templateId ?? null,
      dirty: meta.dirty ?? false,
      ...this.flags(),
    };
    this.emit();
  }

  markSaved(projectId: string): void {
    this.set({ projectId, dirty: false });
  }

  select(id: string | null): void {
    if (id === this.s.selectedId) return;
    this.set({ selectedId: id });
  }

  showToast(message: string, kind: Toast['kind'] = 'info'): void {
    this.toastCounter += 1;
    this.set({ toast: { id: this.toastCounter, message, kind } });
  }

  dismissToast(id: number): void {
    if (this.s.toast?.id === id) this.set({ toast: null });
  }
}
