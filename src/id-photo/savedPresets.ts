import type { IdPreset } from './presets';

const KEY = 'photo-studio:id-presets:v1';

export function loadUserPresets(): IdPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is IdPreset => !!p && typeof p.id === 'string' && typeof p.label === 'string' && p.width > 0 && p.height > 0 && ['in', 'mm', 'cm'].includes(p.unit),
    );
  } catch {
    return [];
  }
}

export function saveUserPresets(list: IdPreset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: presets just are not remembered */
  }
}
