import { useState } from 'react';
import { exportPixelSize, canvasSizeProblem } from '../export/size';
import { MM_PER_INCH } from '../id-photo/presets';
import { loadPrefs, savePrefs } from '../project/prefs';
import { useDoc, useStudio } from '../services/context';
import { ui } from '../services/ui';
import type { ExportFormat } from '../export/exporter';
import { Button, Modal, NumberField, Row, Segmented, Slider } from './ui';

export function ExportDialog() {
  const studio = useStudio();
  const doc = useDoc();
  const prefs = loadPrefs();
  const [format, setFormat] = useState<ExportFormat>(prefs.exportFormat);
  const [quality, setQuality] = useState(prefs.exportQuality);
  const [dpi, setDpi] = useState(doc.dpi);
  const size = exportPixelSize(doc, dpi);
  const problem = canvasSizeProblem(size.width, size.height);
  const inW = size.width / dpi;
  const inH = size.height / dpi;
  const go = async () => {
    savePrefs({ exportFormat: format, exportQuality: quality });
    ui.close();
    await studio.exportDoc({ format, quality, dpi });
  };
  return (
    <Modal title="Export" onClose={() => ui.close()} footer={<><Button onClick={() => ui.close()}>Cancel</Button><Button primary disabled={!!problem} onClick={go}>Export {format.toUpperCase()}</Button></>}>
      <Row label="Format"><Segmented<ExportFormat> value={format} onChange={setFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'pdf', label: 'PDF' }]} /></Row>
      {format !== 'png' && <Slider label="Quality" min={0.1} max={1} step={0.01} value={quality} format={(v) => `${Math.round(v * 100)}%`} onInput={setQuality} />}
      <Row label="Resolution"><NumberField ariaLabel="Export DPI" value={dpi} min={1} max={1200} onChange={setDpi} /> DPI</Row>
      <div className="btn-row">{[72, 150, 300, 600].map((d) => <Button key={d} small active={dpi === d} onClick={() => setDpi(d)}>{d}</Button>)}<Button small onClick={() => setDpi(doc.dpi)}>Document ({doc.dpi})</Button></div>
      <p className="panel-note" data-testid="export-size">
        Output: <strong>{size.width} × {size.height} px</strong> · prints at {inW.toFixed(2)} × {inH.toFixed(2)} in ({(inW * MM_PER_INCH).toFixed(1)} × {(inH * MM_PER_INCH).toFixed(1)} mm) when printed at {dpi} DPI.
      </p>
      {problem && <p className="error-text">{problem}</p>}
      <p className="panel-note">
        {format === 'png' && 'PNG keeps transparency. The DPI is stored in the file.'}
        {format === 'jpg' && 'JPG has no transparency: transparent areas become white. The DPI is stored in the file.'}
        {format === 'pdf' && 'PDF page size equals the physical print size (72 points = 1 inch). Transparent areas become white.'}
      </p>
      <p className="panel-note">Exports are final pictures. Keep your editable work with File &gt; Save or Download Project File.</p>
    </Modal>
  );
}
