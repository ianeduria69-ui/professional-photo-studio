import { useEffect } from 'react';
import type { Studio } from '../services/studio';
import { importImageFile } from '../services/files';
import { ui } from '../services/ui';
import type { ToolId } from '../types';

const TOOL_KEYS: Record<string, ToolId> = { v: 'move', m: 'select', c: 'crop', b: 'brush', e: 'eraser', t: 'text', u: 'shape', w: 'bgremove', i: 'picker' };

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Keyboard shortcuts + clipboard paste for one Studio. `full` enables menu-level shortcuts (editor only). */
export function useShortcuts(studio: Studio, enabled: boolean, full: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const store = studio.store;
    const onKey = (e: KeyboardEvent) => {
      if (ui.getState().dialog || typing(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
        else if (k === 'y') { e.preventDefault(); store.redo(); }
        else if (k === 'd' && full) { e.preventDefault(); studio.duplicateSelected(); }
        else if (k === 'a' && full) { e.preventDefault(); studio.selectAll(); }
        else if (k === 's' && full) { e.preventDefault(); void studio.saveProject(); }
        else if (k === 'e' && full) { e.preventDefault(); ui.open({ type: 'export' }); }
        else if (k === 'n' && full) { e.preventDefault(); ui.open({ type: 'new' }); }
        else if (k === '0') { e.preventDefault(); studio.fit(); }
        else if (k === '1') { e.preventDefault(); studio.actualSize(); }
        else if (k === '=' || k === '+') { e.preventDefault(); studio.zoomBy(1.25); }
        else if (k === '-') { e.preventDefault(); studio.zoomBy(1 / 1.25); }
        else if (e.key === ']' && full) { const id = store.state.selectedId; if (id) studio.moveLayerOrder(id, e.shiftKey ? 'top' : 'up'); }
        else if (e.key === '[' && full) { const id = store.state.selectedId; if (id) studio.moveLayerOrder(id, e.shiftKey ? 'bottom' : 'down'); }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (full) { e.preventDefault(); studio.deleteLayer(); } }
      else if (e.key === 'Enter' && store.state.tool === 'crop') studio.applyCrop();
      else if (e.key === 'Escape') { studio.cancelCrop(); studio.deselect(); }
      else if (e.key.startsWith('Arrow') && full) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        studio.nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
      } else if (k === 'x') store.set({ fg: store.state.bg, bg: store.state.fg });
      else if (TOOL_KEYS[k] && (full || ['move', 'eraser', 'bgremove'].includes(TOOL_KEYS[k]))) {
        if (TOOL_KEYS[k] !== 'crop') studio.cancelCrop();
        store.set({ tool: TOOL_KEYS[k] });
      }
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (ui.getState().dialog || typing(e.target)) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      await studio.run('Pasting picture…', async () => {
        const imp = await importImageFile(new File([file], 'Pasted picture.png', { type: file.type }));
        studio.placeImage(imp);
      });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [studio, enabled, full]);
}
