import { useState } from 'react';
import { useStudio } from '../services/context';
import { ui } from '../services/ui';
import { toPixels } from '../id-photo/presets';
import type { Unit } from '../types';
import { Button, ColorField, Modal, NumberField, Row, Select } from './ui';

interface DocPreset { id: string; label: string; w: number; h: number; unit: Unit; dpi: number }

export const DOC_PRESETS: DocPreset[] = [
  { id: 'custom', label: 'Custom', w: 1200, h: 800, unit: 'px', dpi: 72 },
  { id: 'social', label: 'Social post 1080 × 1080 px', w: 1080, h: 1080, unit: 'px', dpi: 72 },
  { id: 'hd', label: 'HD screen 1920 × 1080 px', w: 1920, h: 1080, unit: 'px', dpi: 72 },
  { id: 'id2', label: 'ID photo 2 × 2 in', w: 2, h: 2, unit: 'in', dpi: 300 },
  { id: 'id1', label: 'ID photo 1 × 1 in', w: 1, h: 1, unit: 'in', dpi: 300 },
  { id: 'a4', label: 'A4 portrait 210 × 297 mm', w: 210, h: 297, unit: 'mm', dpi: 300 },
  { id: '4r', label: '4R photo 4 × 6 in', w: 4, h: 6, unit: 'in', dpi: 300 },
  { id: 'bcard', label: 'Business card 3.5 × 2 in', w: 3.5, h: 2, unit: 'in', dpi: 300 },
  { id: 'poster', label: 'Poster 11 × 17 in', w: 11, h: 17, unit: 'in', dpi: 150 },
];

export function NewDocumentDialog() {
  const studio = useStudio();
  const [preset, setPreset] = useState('custom');
  const [name, setName] = useState('Untitled');
  const [w, setW] = useState(1200);
  const [h, setH] = useState(800);
  const [unit, setUnit] = useState<Unit>('px');
  const [dpi, setDpi] = useState(72);
  const [color, setColor] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const pw = toPixels(w, unit, dpi);
  const ph = toPixels(h, unit, dpi);
  const tooBig = pw > 16000 || ph > 16000;

  const choose = (id: string) => {
    setPreset(id);
    const p = DOC_PRESETS.find((x) => x.id === id);
    if (p && id !== 'custom') { setW(p.w); setH(p.h); setUnit(p.unit); setDpi(p.dpi); }
  };
  const create = async () => {
    ui.close();
    await studio.newDocument({ name: name.trim() || 'Untitled', width: pw, height: ph, dpi, backgroundColor: color, transparent });
  };
  return (
    <Modal title="New document" onClose={() => ui.close()} footer={<><Button onClick={() => ui.close()}>Cancel</Button><Button primary disabled={tooBig} onClick={create}>Create</Button></>}>
      <Row label="Preset"><Select value={preset} ariaLabel="Preset" onChange={choose} options={DOC_PRESETS.map((p) => ({ value: p.id, label: p.label }))} /></Row>
      <Row label="Name"><input type="text" aria-label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} /></Row>
      <Row label="Width"><NumberField ariaLabel="Width" value={w} min={0.1} decimals={3} onChange={(v) => { setW(v); setPreset('custom'); }} /></Row>
      <Row label="Height"><NumberField ariaLabel="Height" value={h} min={0.1} decimals={3} onChange={(v) => { setH(v); setPreset('custom'); }} /></Row>
      <Row label="Unit"><Select<Unit> value={unit} ariaLabel="Unit" onChange={setUnit} options={[{ value: 'px', label: 'pixels' }, { value: 'in', label: 'inches' }, { value: 'mm', label: 'millimetres' }, { value: 'cm', label: 'centimetres' }]} /></Row>
      <Row label="Resolution"><NumberField ariaLabel="DPI" value={dpi} min={1} max={1200} onChange={setDpi} /> DPI</Row>
      <Row label="Background"><ColorField ariaLabel="Background colour" value={color} onChange={setColor} /><label className="check-inline"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.currentTarget.checked)} /> Transparent</label></Row>
      <p className="panel-note" data-testid="new-doc-size">Result: <strong>{pw} × {ph} px</strong> at {dpi} DPI.{tooBig ? ' Too large for a browser canvas (max 16000 px per side).' : ''}</p>
    </Modal>
  );
}
