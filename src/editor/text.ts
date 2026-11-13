import type { DocumentModel, TextLayer } from '../types';

/** Returns the rendered width in px of `text` for a CSS font string. */
export type Measure = (font: string, text: string) => number;

export function fontString(l: Pick<TextLayer, 'italic' | 'bold' | 'fontSize' | 'fontFamily'>): string {
  const family = /\s/.test(l.fontFamily) ? `"${l.fontFamily}"` : l.fontFamily;
  return `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${l.fontSize}px ${family}, sans-serif`;
}

/** Greedy word wrap. Explicit newlines are always kept. Words longer than the box overflow. */
export function wrapText(text: string, font: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measure(font, candidate) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

export interface TextLayout {
  lines: string[];
  lineHeightPx: number;
  height: number;
}

export function layoutText(layer: TextLayer, measure: Measure): TextLayout {
  const lines = wrapText(layer.text, fontString(layer), layer.width, measure);
  const lineHeightPx = layer.fontSize * layer.lineHeight;
  return { lines, lineHeightPx, height: Math.max(lineHeightPx, lines.length * lineHeightPx) };
}

/** Set every text layer's height to match its wrapped content. */
export function normalizeTextLayers(doc: DocumentModel, measure: Measure): DocumentModel {
  let changed = false;
  const layers = doc.layers.map((l) => {
    if (l.kind !== 'text') return l;
    const h = layoutText(l, measure).height;
    if (Math.abs(h - l.height) < 0.01) return l;
    changed = true;
    return { ...l, height: h };
  });
  return changed ? { ...doc, layers } : doc;
}
