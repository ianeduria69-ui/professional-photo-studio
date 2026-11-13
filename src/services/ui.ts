/** Tiny external store for dialogs and the active view. Kept apart from the editor so dialogs can outlive documents. */
export type Dialog =
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; resolve: (ok: boolean) => void }
  | { type: 'prompt'; title: string; label: string; value: string; resolve: (value: string | null) => void }
  | { type: 'alert'; title: string; message: string }
  | { type: 'new' }
  | { type: 'export' }
  | { type: 'projects'; tab: 'projects' | 'templates' }
  | { type: 'resize'; mode: 'image' | 'canvas' }
  | { type: 'help'; tab: 'shortcuts' | 'about' | 'ai' };

export type View = 'editor' | 'id';

export interface UiState {
  dialog: Dialog | null;
  view: View;
  /** Incremented to ask the Properties panel to focus the text box. */
  focusText: number;
}

export class UiStore {
  private state: UiState = { dialog: null, view: 'editor', focusText: 0 };
  private readonly listeners = new Set<() => void>();

  getState = (): UiState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  setView(view: View): void {
    this.set({ view });
  }

  requestTextFocus(): void {
    this.set({ focusText: this.state.focusText + 1 });
  }

  open(dialog: Dialog): void {
    this.set({ dialog });
  }

  close(): void {
    this.set({ dialog: null });
  }

  confirm(title: string, message: string, confirmLabel = 'OK'): Promise<boolean> {
    return new Promise((resolve) => {
      this.set({
        dialog: {
          type: 'confirm',
          title,
          message,
          confirmLabel,
          resolve: (ok) => {
            this.set({ dialog: null });
            resolve(ok);
          },
        },
      });
    });
  }

  prompt(title: string, label: string, value: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.set({
        dialog: {
          type: 'prompt',
          title,
          label,
          value,
          resolve: (v) => {
            this.set({ dialog: null });
            resolve(v);
          },
        },
      });
    });
  }

  alert(title: string, message: string): void {
    this.set({ dialog: { type: 'alert', title, message } });
  }
}

export const ui = new UiStore();
