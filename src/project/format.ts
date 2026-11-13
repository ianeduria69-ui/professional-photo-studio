import { pruneAssets, DOC_VERSION } from '../editor/document';
import {
  DEFAULT_ADJUSTMENTS,
  type BorderStyle,
  type DocumentModel,
  type Guide,
  type Layer,
  type ShadowStyle,
} from '../types';

export const PROJECT_FORMAT = 'photo-studio-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.pps.json';

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  app: string;
  document: DocumentModel;
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

/**
 * Native editable project file: JSON that keeps every layer, its transform,
 * opacity, visibility, lock state, text/shape properties, adjustments, guides
 * and the embedded image assets. Nothing is flattened.
 */
export function serializeProject(doc: DocumentModel, now: Date = new Date()): string {
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    app: 'Professional Photo Studio',
    document: pruneAssets(doc),
  };
  return JSON.stringify(file);
}

export function parseProject(json: string): DocumentModel {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectError('This file is not valid JSON, so it cannot be a Photo Studio project.');
  }
  if (!isRecord(raw) || raw.format !== PROJECT_FORMAT) {
    throw new ProjectError('This is not a Photo Studio project file (missing format marker).');
  }
  if (typeof raw.version !== 'number' || raw.version > PROJECT_VERSION) {
    throw new ProjectError(
      `This project was saved by a newer version of the app (file version ${String(raw.version)}).`,
    );
  }
  return validateDocument(raw.document);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, field: string, fallback?: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (fallback !== undefined && v === undefined) return fallback;
  throw new ProjectError(`Invalid number for "${field}".`);
}

function str(v: unknown, field: string, fallback?: string): string {
  if (typeof v === 'string') return v;
  if (fallback !== undefined && v === undefined) return fallback;
  throw new ProjectError(`Invalid text for "${field}".`);
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function shadow(v: unknown): ShadowStyle {
  const r = isRecord(v) ? v : {};
  return {
    enabled: bool(r.enabled, false),
    color: str(r.color, 'shadow.color', '#000000'),
    blur: num(r.blur, 'shadow.blur', 12),
    offsetX: num(r.offsetX, 'shadow.offsetX', 4),
    offsetY: num(r.offsetY, 'shadow.offsetY', 4),
  };
}

function border(v: unknown): BorderStyle {
  const r = isRecord(v) ? v : {};
  return {
    enabled: bool(r.enabled, false),
    color: str(r.color, 'border.color', '#000000'),
    width: num(r.width, 'border.width', 4),
  };
}

function validateLayer(raw: unknown, index: number): Layer {
  if (!isRecord(raw)) throw new ProjectError(`Layer ${index + 1} is not an object.`);
  const label = `layer ${index + 1}`;
  const base = {
    id: str(raw.id, `${label}.id`),
    name: str(raw.name, `${label}.name`, `Layer ${index + 1}`),
    visible: bool(raw.visible, true),
    locked: bool(raw.locked, false),
    opacity: Math.max(0, Math.min(1, num(raw.opacity, `${label}.opacity`, 1))),
    x: num(raw.x, `${label}.x`),
    y: num(raw.y, `${label}.y`),
    width: num(raw.width, `${label}.width`),
    height: num(raw.height, `${label}.height`),
    rotation: num(raw.rotation, `${label}.rotation`, 0),
    flipX: bool(raw.flipX, false),
    flipY: bool(raw.flipY, false),
    shadow: shadow(raw.shadow),
    border: border(raw.border),
  };

  switch (raw.kind) {
    case 'image': {
      const a = isRecord(raw.adjustments) ? raw.adjustments : {};
      const adjustments = { ...DEFAULT_ADJUSTMENTS };
      for (const k of Object.keys(DEFAULT_ADJUSTMENTS) as (keyof typeof DEFAULT_ADJUSTMENTS)[]) {
        const v = a[k];
        if (k === 'grayscale') adjustments.grayscale = bool(v, false);
        else if (typeof v === 'number' && Number.isFinite(v)) adjustments[k] = v;
      }
      return {
        ...base,
        kind: 'image',
        assetId: str(raw.assetId, `${label}.assetId`),
        ...(typeof raw.originalAssetId === 'string' ? { originalAssetId: raw.originalAssetId } : {}),
        naturalWidth: num(raw.naturalWidth, `${label}.naturalWidth`),
        naturalHeight: num(raw.naturalHeight, `${label}.naturalHeight`),
        adjustments,
      };
    }
    case 'text': {
      const align = raw.align === 'center' || raw.align === 'right' ? raw.align : 'left';
      return {
        ...base,
        kind: 'text',
        text: str(raw.text, `${label}.text`),
        fontFamily: str(raw.fontFamily, `${label}.fontFamily`, 'Arial'),
        fontSize: num(raw.fontSize, `${label}.fontSize`, 48),
        bold: bool(raw.bold, false),
        italic: bool(raw.italic, false),
        color: str(raw.color, `${label}.color`, '#111111'),
        align,
        lineHeight: num(raw.lineHeight, `${label}.lineHeight`, 1.2),
      };
    }
    case 'shape': {
      const shape = raw.shape === 'ellipse' || raw.shape === 'line' ? raw.shape : 'rect';
      return {
        ...base,
        kind: 'shape',
        shape,
        fill: typeof raw.fill === 'string' ? raw.fill : null,
        stroke: typeof raw.stroke === 'string' ? raw.stroke : null,
        strokeWidth: num(raw.strokeWidth, `${label}.strokeWidth`, 0),
        cornerRadius: num(raw.cornerRadius, `${label}.cornerRadius`, 0),
      };
    }
    default:
      throw new ProjectError(`Layer ${index + 1} has an unknown type "${String(raw.kind)}".`);
  }
}

export function validateDocument(raw: unknown): DocumentModel {
  if (!isRecord(raw)) throw new ProjectError('The project has no document.');
  const width = num(raw.width, 'width');
  const height = num(raw.height, 'height');
  if (width < 1 || height < 1) throw new ProjectError('The canvas size must be at least 1 × 1 pixel.');
  if (!Array.isArray(raw.layers)) throw new ProjectError('The project has no layer list.');

  const assets: Record<string, string> = {};
  if (isRecord(raw.assets)) {
    for (const [k, v] of Object.entries(raw.assets)) if (typeof v === 'string') assets[k] = v;
  }
  const layers = raw.layers.map((l, i) => validateLayer(l, i));
  for (const l of layers) {
    if (l.kind === 'image' && !assets[l.assetId]) {
      throw new ProjectError(`Image layer "${l.name}" is missing its picture data; the file may be damaged.`);
    }
  }

  const bg = isRecord(raw.background) ? raw.background : {};
  const guides: Guide[] = Array.isArray(raw.guides)
    ? raw.guides
        .filter(isRecord)
        .map((g, i) => ({
          id: typeof g.id === 'string' ? g.id : `guide_${i}`,
          orientation: (g.orientation === 'h' ? 'h' : 'v') as 'h' | 'v',
          position: typeof g.position === 'number' && Number.isFinite(g.position) ? g.position : 0,
        }))
    : [];

  return {
    version: DOC_VERSION,
    id: str(raw.id, 'id', `doc_${Date.now()}`),
    name: str(raw.name, 'name', 'Untitled'),
    width: Math.round(width),
    height: Math.round(height),
    dpi: num(raw.dpi, 'dpi', 72),
    background: { transparent: bool(bg.transparent, false), color: str(bg.color, 'background.color', '#ffffff') },
    layers,
    assets,
    guides,
  };
}

export function projectFileName(doc: Pick<DocumentModel, 'name'>): string {
  const safe = doc.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  return `${safe}${PROJECT_EXTENSION}`;
}
