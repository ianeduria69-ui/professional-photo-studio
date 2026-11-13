const KEY = 'photo-studio:prefs:v1';

export interface Prefs {
  fg: string;
  bg: string;
  brushSize: number;
  brushHardness: number;
  brushOpacity: number;
  showRulers: boolean;
  snap: boolean;
  exportFormat: 'png' | 'jpg' | 'pdf';
  exportQuality: number;
  exportDpi: number;
}

export const DEFAULT_PREFS: Prefs = {
  fg: '#111111',
  bg: '#ffffff',
  brushSize: 24,
  brushHardness: 80,
  brushOpacity: 100,
  showRulers: true,
  snap: true,
  exportFormat: 'png',
  exportQuality: 0.92,
  exportDpi: 300,
};

/** User preferences live in localStorage. Failures (private mode, quota) are ignored. */
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* ignore */
  }
}
