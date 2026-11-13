import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorState } from '../editor/store';
import type { DocumentModel, Layer } from '../types';
import type { Studio } from './studio';
import { ui, type UiState } from './ui';

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error('useStudio must be used inside a StudioContext.Provider');
  return s;
}

/**
 * Subscribe to part of the editor state. The selector must return a primitive or an
 * object that already exists in the state (never a freshly built object).
 */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const studio = useStudio();
  return useSyncExternalStore(studio.store.subscribe, () => selector(studio.store.getState()));
}

export function useDoc(): DocumentModel {
  return useEditor((s) => s.doc);
}

export function useSelectedLayer(): Layer | undefined {
  return useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedId));
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => selector(ui.getState()));
}

export function useCursorText(): string {
  const studio = useStudio();
  return useSyncExternalStore(studio.subscribeCursor, studio.getCursor);
}
