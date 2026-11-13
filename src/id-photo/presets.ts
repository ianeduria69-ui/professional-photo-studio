import type { Unit } from '../types';

export const MM_PER_INCH = 25.4;
export const CM_PER_INCH = 2.54;

export function toInches(value: number, unit: Unit, dpi = 300): number {
  switch (unit) {
    case 'in':
      return value;
    case 'mm':
      return value / MM_PER_INCH;
    case 'cm':
      return value / CM_PER_INCH;
    case 'px':
      return value / dpi;
  }
}

export function fromInches(inches: number, unit: Unit, dpi = 300): number {
  switch (unit) {
    case 'in':
      return inches;
    case 'mm':
      return inches * MM_PER_INCH;
    case 'cm':
      return inches * CM_PER_INCH;
    case 'px':
      return inches * dpi;
  }
}

/** Physical measurement -> whole pixels at `dpi`. */
export function toPixels(value: number, unit: Unit, dpi: number): number {
  return Math.max(1, Math.round(toInches(value, unit, dpi) * dpi));
}

export interface IdPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: Exclude<Unit, 'px'>;
  /** Shown in the UI. Requirements differ per agency, so presets are guidance only. */
  note?: string;
}

export const ID_PRESETS: IdPreset[] = [
  {
    id: '2x2in',
    label: '2×2 inch',
    width: 2,
    height: 2,
    unit: 'in',
    note: '50.8 × 50.8 mm. Common for US visas/passports and many local IDs.',
  },
  {
    id: '1x1in',
    label: '1×1 inch',
    width: 1,
    height: 1,
    unit: 'in',
    note: '25.4 × 25.4 mm. Common "1x1" ID picture size.',
  },
  {
    id: '1.5x1.5in',
    label: '1.5×1.5 inch',
    width: 1.5,
    height: 1.5,
    unit: 'in',
    note: '38.1 × 38.1 mm. Sometimes asked for by employers and schools.',
  },
  {
    id: 'passport-35x45',
    label: 'Passport 35×45 mm',
    width: 35,
    height: 45,
    unit: 'mm',
    note: 'ICAO-style 35 × 45 mm. Always confirm the size and head-position rules with the agency that will accept the photo.',
  },
];

export function presetById(id: string): IdPreset | undefined {
  return ID_PRESETS.find((p) => p.id === id);
}

export function customPreset(width: number, height: number, unit: Exclude<Unit, 'px'>, label?: string): IdPreset {
  return { id: 'custom', label: label ?? `Custom ${width}×${height} ${unit}`, width, height, unit };
}

/** Custom aspect ratio (e.g. 3:4) and a chosen width -> a preset with the matching height. */
export function presetFromAspect(ratioW: number, ratioH: number, width: number, unit: Exclude<Unit, 'px'>): IdPreset {
  if (!(ratioW > 0) || !(ratioH > 0) || !(width > 0)) throw new Error('Aspect ratio and width must be positive.');
  const height = (width * ratioH) / ratioW;
  return customPreset(width, Math.round(height * 1000) / 1000, unit, `Custom ${ratioW}:${ratioH}`);
}

export function presetPixelSize(p: IdPreset, dpi: number): { width: number; height: number } {
  return { width: toPixels(p.width, p.unit, dpi), height: toPixels(p.height, p.unit, dpi) };
}

/** "2 × 2 in (50.8 × 50.8 mm)" */
export function describePreset(p: IdPreset): string {
  const inW = toInches(p.width, p.unit);
  const inH = toInches(p.height, p.unit);
  const mmW = inW * MM_PER_INCH;
  const mmH = inH * MM_PER_INCH;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(inW)} × ${r(inH)} in (${r(mmW)} × ${r(mmH)} mm)`;
}

export interface PaperSize {
  id: string;
  label: string;
  width: number;
  height: number;
  unit: Exclude<Unit, 'px'>;
}

/** Portrait dimensions. */
export const PAPER_SIZES: PaperSize[] = [
  { id: '4R', label: '4R (4×6 in)', width: 4, height: 6, unit: 'in' },
  { id: '5R', label: '5R (5×7 in)', width: 5, height: 7, unit: 'in' },
  { id: '3R', label: '3R (3.5×5 in)', width: 3.5, height: 5, unit: 'in' },
  { id: 'A4', label: 'A4 (210×297 mm)', width: 210, height: 297, unit: 'mm' },
  { id: 'letter', label: 'Letter (8.5×11 in)', width: 8.5, height: 11, unit: 'in' },
];

export function paperById(id: string): PaperSize | undefined {
  return PAPER_SIZES.find((p) => p.id === id);
}

export function paperPixelSize(p: Pick<PaperSize, 'width' | 'height' | 'unit'>, dpi: number): { width: number; height: number } {
  return { width: toPixels(p.width, p.unit, dpi), height: toPixels(p.height, p.unit, dpi) };
}
