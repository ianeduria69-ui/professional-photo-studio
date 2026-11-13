export type ToolId =
  | 'move'
  | 'select'
  | 'crop'
  | 'brush'
  | 'eraser'
  | 'text'
  | 'shape'
  | 'bgremove'
  | 'picker';

export type ShapeKind = 'rect' | 'ellipse' | 'line';
export type TextAlign = 'left' | 'center' | 'right';
export type Unit = 'px' | 'in' | 'mm' | 'cm';

export interface Adjustments {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  exposure: number; // -100..100 (±2 EV)
  temperature: number; // -100 (cool) .. 100 (warm)
  tint: number; // -100 (green) .. 100 (magenta)
  hue: number; // -180..180 degrees
  sharpness: number; // 0..100
  blur: number; // 0..20 document px
  grayscale: boolean;
}

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  sharpness: 0,
  blur: 0,
  grayscale: false,
});

export interface ShadowStyle {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface BorderStyle {
  enabled: boolean;
  color: string;
  width: number;
}

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  /** Top-left of the (unrotated) box in document pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, around the box centre. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  shadow: ShadowStyle;
  border: BorderStyle;
}

export interface ImageLayer extends LayerBase {
  kind: 'image';
  assetId: string;
  /** Asset before background removal, so it can be restored. */
  originalAssetId?: string;
  naturalWidth: number;
  naturalHeight: number;
  adjustments: Adjustments;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
}

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  cornerRadius: number;
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

export interface Guide {
  id: string;
  orientation: 'h' | 'v';
  /** Document pixels. */
  position: number;
}

export interface DocBackground {
  transparent: boolean;
  color: string;
}

export interface DocumentModel {
  version: number;
  id: string;
  name: string;
  /** Canvas size in pixels. */
  width: number;
  height: number;
  /** Pixels per inch used for print size / export metadata. */
  dpi: number;
  background: DocBackground;
  /** Bottom to top. */
  layers: Layer[];
  /** assetId -> data URL. Shared between layers, history and project files. */
  assets: Record<string, string>;
  guides: Guide[];
}

export const FONT_FAMILIES = [
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Palatino Linotype',
  'Courier New',
  'Impact',
  'Brush Script MT',
] as const;
