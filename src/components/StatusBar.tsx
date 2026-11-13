import { useCursorText, useDoc, useEditor, useStudio } from '../services/context';
import { MM_PER_INCH } from '../id-photo/presets';

export function StatusBar() {
  const studio = useStudio();
  const doc = useDoc();
  const zoom = useEditor((s) => s.zoom);
  const dirty = useEditor((s) => s.dirty);
  const busy = useEditor((s) => s.busy);
  const sel = useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedId));
  const cursor = useCursorText();
  const inW = doc.width / doc.dpi;
  const inH = doc.height / doc.dpi;
  return (
    <footer className="statusbar">
      <span className="zoomctl">
        <button aria-label="Zoom out" onClick={() => studio.zoomBy(1 / 1.25)}>−</button>
        <select
          aria-label="Zoom level"
          value=""
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === 'fit') studio.fit();
            else if (v) studio.zoomAt(parseFloat(v), studio.viewport.width / 2, studio.viewport.height / 2);
          }}
        >
          <option value="">{Math.round(zoom * 100)}%</option>
          <option value="fit">Fit</option>
          {[0.25, 0.5, 1, 2, 4].map((z) => <option key={z} value={z}>{z * 100}%</option>)}
        </select>
        <button aria-label="Zoom in" onClick={() => studio.zoomBy(1.25)}>+</button>
      </span>
      <span data-testid="status-canvas">Canvas {doc.width} × {doc.height} px</span>
      <span>{inW.toFixed(2)} × {inH.toFixed(2)} in ({(inW * MM_PER_INCH).toFixed(1)} × {(inH * MM_PER_INCH).toFixed(1)} mm) @ {doc.dpi} DPI</span>
      <span>{doc.layers.length} layer(s)</span>
      {sel && <span>Selected: {sel.name} {Math.round(sel.width)} × {Math.round(sel.height)}</span>}
      <span className="spacer" />
      {busy && <span className="busy">⏳ {busy}</span>}
      <span>{cursor}</span>
      <span className={dirty ? 'dirty' : 'saved'}>{doc.name}{dirty ? ' • unsaved' : ''}</span>
    </footer>
  );
}
