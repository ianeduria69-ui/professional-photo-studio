import { useEffect } from 'react';
import { useEditor, useStudio } from '../services/context';

export function Toasts() {
  const studio = useStudio();
  const toast = useEditor((s) => s.toast);
  const busy = useEditor((s) => s.busy);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => studio.store.dismissToast(toast.id), toast.kind === 'error' ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [toast, studio]);
  return (
    <>
      {toast && (
        <div className={`toast ${toast.kind}`} role="status" onClick={() => studio.store.dismissToast(toast.id)}>
          {toast.message}
        </div>
      )}
      {busy && <div className="busy-pill" role="progressbar" aria-label={busy}>{busy}</div>}
    </>
  );
}
