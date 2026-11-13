import { useState } from 'react';
import { useDoc, useStudio } from '../services/context';
import { ui } from '../services/ui';
import { Button, Check, Modal, NumberField, Row, Segmented } from './ui';

export function ResizeDialog({ mode }: { mode: 'image' | 'canvas' }) {
  const studio = useStudio();
  const doc = useDoc();
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [lock, setLock] = useState(mode === 'image');
  const [anchor, setAnchor] = useState<'center' | 'topleft'>('center');
  const ratio = doc.width / doc.height;
  const bad = w > 16000 || h > 16000;
  const apply = () => {
    ui.close();
    if (mode === 'image') studio.resizeImageTo(w, h);
    else studio.resizeCanvasTo(w, h, anchor);
  };
  return (
    <Modal title={mode === 'image' ? 'Image size' : 'Canvas size'} onClose={() => ui.close()} footer={<><Button onClick={() => ui.close()}>Cancel</Button><Button primary disabled={bad} onClick={apply}>OK</Button></>}>
      <p className="panel-note">{mode === 'image' ? 'Scales the whole document: the canvas and every layer.' : 'Changes the canvas only. Layers keep their size and are moved with the chosen anchor.'}</p>
      <Row label="Width"><NumberField ariaLabel="Width" value={w} min={1} max={16000} onChange={(v) => { setW(Math.round(v)); if (lock) setH(Math.max(1, Math.round(v / ratio))); }} /> px</Row>
      <Row label="Height"><NumberField ariaLabel="Height" value={h} min={1} max={16000} onChange={(v) => { setH(Math.round(v)); if (lock) setW(Math.max(1, Math.round(v * ratio))); }} /> px</Row>
      <Check checked={lock} onChange={setLock} label="Keep proportions" />
      {mode === 'canvas' && <Row label="Anchor"><Segmented value={anchor} onChange={setAnchor} options={[{ value: 'center', label: 'Center' }, { value: 'topleft', label: 'Top-left' }]} /></Row>}
      {bad && <p className="error-text">Maximum 16000 px per side.</p>}
    </Modal>
  );
}
