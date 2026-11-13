import { useEditor, useStudio } from '../services/context';
import type { ShapeKind } from '../types';
import { Button, NumberField, Segmented, Select } from './ui';

const ASPECTS: { value: string; label: string; ratio: number | null }[] = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: '1:1 (square)', ratio: 1 },
  { value: '4:5', label: '4:5', ratio: 4 / 5 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
  { value: '35:45', label: '35:45 (passport)', ratio: 35 / 45 },
  { value: '2:3', label: '2:3', ratio: 2 / 3 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
];

export function OptionsBar() {
  const studio = useStudio();
  const s = useEditor((st) => st);
  const brush = s.brush;
  const setBrush = (p: Partial<typeof brush>) => studio.store.set({ brush: { ...brush, ...p } });
  const sel = s.selection;
  const selLayer = s.doc.layers.find((l) => l.id === s.selectedId);
  const aspectKey = ASPECTS.find((a) => a.ratio === s.cropAspect)?.value ?? 'free';

  switch (s.tool) {
    case 'brush':
    case 'eraser':
      return (
        <div className="options" aria-label="Tool options">
          <span className="opt-title">{s.tool === 'brush' ? 'Brush' : 'Eraser'}</span>
          <label>Size <NumberField ariaLabel="Brush size" value={brush.size} min={1} max={1000} onChange={(v) => setBrush({ size: v })} /> px</label>
          <input type="range" aria-label="Brush size slider" min={1} max={300} value={Math.min(300, brush.size)} onChange={(e) => setBrush({ size: +e.currentTarget.value })} />
          <label>Hardness <NumberField ariaLabel="Brush hardness" value={brush.hardness} min={0} max={100} onChange={(v) => setBrush({ hardness: v })} />%</label>
          <label>Opacity <NumberField ariaLabel="Brush opacity" value={brush.opacity} min={1} max={100} onChange={(v) => setBrush({ opacity: v })} />%</label>
          <span className="hint">{s.tool === 'brush' ? 'Paints on the selected picture layer (or a new paint layer).' : 'Erases pixels of the selected picture layer.'}</span>
        </div>
      );
    case 'shape':
      return (
        <div className="options">
          <span className="opt-title">Shape</span>
          <Segmented<ShapeKind> value={s.shapeKind} onChange={(v) => studio.store.set({ shapeKind: v })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }, { value: 'line', label: 'Line' }]} />
          <span className="hint">Drag on the canvas (Shift = square / 15° angles). Colour = foreground colour.</span>
        </div>
      );
    case 'crop':
      return (
        <div className="options">
          <span className="opt-title">Crop</span>
          <label>Aspect <Select value={aspectKey} ariaLabel="Crop aspect ratio" options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))} onChange={(v) => {
            const ratio = ASPECTS.find((a) => a.value === v)?.ratio ?? null;
            const r = s.cropRect;
            if (ratio && r) {
              const h = r.width / ratio;
              studio.store.set({ cropAspect: ratio, cropRect: { ...r, height: Math.min(h, s.doc.height - r.y) } });
            } else studio.store.set({ cropAspect: ratio });
          }} /></label>
          {s.cropRect && <span className="readout">{Math.round(s.cropRect.width)} × {Math.round(s.cropRect.height)} px</span>}
          <Button primary small disabled={!s.cropRect} onClick={() => studio.applyCrop()}>Apply (Enter)</Button>
          <Button small disabled={!s.cropRect} onClick={() => studio.cancelCrop()}>Cancel (Esc)</Button>
          <span className="hint">Crops the canvas and every layer with it.</span>
        </div>
      );
    case 'select':
      return (
        <div className="options">
          <span className="opt-title">Selection</span>
          {sel && <span className="readout">{Math.round(sel.width)} × {Math.round(sel.height)} px at {Math.round(sel.x)}, {Math.round(sel.y)}</span>}
          <Button small disabled={!sel} onClick={() => studio.fillSelection()}>Fill with foreground</Button>
          <Button small disabled={!sel || selLayer?.kind !== 'image'} onClick={() => void studio.eraseSelection()}>Erase from picture</Button>
          <Button small disabled={!sel} onClick={() => studio.cropToSelection()}>Crop canvas to selection</Button>
          <Button small disabled={!sel} onClick={() => studio.deselect()}>Deselect</Button>
          {!sel && <span className="hint">Drag a rectangle on the canvas.</span>}
        </div>
      );
    case 'bgremove':
      return (
        <div className="options">
          <span className="opt-title">Background removal</span>
          <label>Tolerance <NumberField ariaLabel="Tolerance" value={s.bgTolerance} min={1} max={100} onChange={(v) => studio.store.set({ bgTolerance: v })} /></label>
          <Button small onClick={() => void studio.removePlainBackground()}>Remove plain background</Button>
          <Button small onClick={() => void studio.removeBackgroundWithAI()}>AI remove</Button>
          <Button small onClick={() => studio.restoreOriginalPicture()}>Restore original</Button>
          <span className="hint">Or click the picture to erase a similar-colour area.</span>
        </div>
      );
    case 'text':
      return <div className="options"><span className="opt-title">Text</span><span className="hint">Click the canvas to add text. Edit it in Properties. Colour = foreground colour.</span></div>;
    case 'picker':
      return <div className="options"><span className="opt-title">Colour picker</span><span className="hint">Click to pick the foreground colour. Alt/Shift-click picks the background colour.</span></div>;
    default:
      return (
        <div className="options">
          <span className="opt-title">Move</span>
          <label className="check-inline"><input type="checkbox" checked={s.snap} onChange={(e) => studio.store.set({ snap: e.currentTarget.checked })} /> Snap to guides &amp; edges</label>
          <span className="hint">Drag to move · handles resize · top circle rotates · Space/middle mouse pans · Ctrl+wheel zooms.</span>
        </div>
      );
  }
}
