import { useState } from 'react';
import { useUi } from '../services/context';
import { ui } from '../services/ui';
import { ExportDialog } from './ExportDialog';
import { NewDocumentDialog } from './NewDocumentDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { ResizeDialog } from './ResizeDialog';
import { Button, Modal, Segmented } from './ui';

const SHORTCUTS: [string, string][] = [
  ['V M C B E T U W I', 'Move, Selection, Crop, Brush, Eraser, Text, Shape, Background removal, Picker'],
  ['Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y)', 'Undo / Redo'],
  ['Ctrl+S / Ctrl+E / Ctrl+N', 'Save / Export / New'],
  ['Ctrl+D', 'Duplicate layer'],
  ['Delete', 'Delete layer'],
  ['Arrow keys (Shift = 10 px)', 'Nudge layer'],
  ['Ctrl+] / Ctrl+[', 'Layer forward / backward (Shift = front / back)'],
  ['Ctrl+A / Esc', 'Select all / Deselect, cancel crop'],
  ['Ctrl+0 / Ctrl+1 / Ctrl +/−', 'Fit / 100% / Zoom'],
  ['Space + drag, middle mouse', 'Pan'],
  ['Ctrl + mouse wheel', 'Zoom at the pointer'],
  ['X', 'Swap foreground / background colour'],
  ['Ctrl+V', 'Paste a picture from the clipboard'],
  ['Enter (Crop tool)', 'Apply crop'],
];

function HelpDialog({ tab: initial }: { tab: 'shortcuts' | 'about' | 'ai' }) {
  const [tab, setTab] = useState(initial);
  return (
    <Modal title="Help" width={640} onClose={() => ui.close()}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'shortcuts', label: 'Shortcuts' }, { value: 'ai', label: 'AI background removal' }, { value: 'about', label: 'About' }]} />
      {tab === 'shortcuts' && <table className="kbd-table"><tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><th>{k}</th><td>{d}</td></tr>)}</tbody></table>}
      {tab === 'ai' && (
        <div className="prose">
          <p>The built-in <strong>plain background remover</strong> and <strong>magic eraser</strong> work offline with no setup, but only for simple one-colour backgrounds.</p>
          <p>For automatic cut-outs of people on busy backgrounds, install the optional open-source AI package. It runs fully in your browser (no server, no paid API):</p>
          <pre>npm install @imgly/background-removal</pre>
          <p>Then restart <code>npm run dev</code>. The first use downloads the model files (internet needed once).</p>
          <p>If the package is missing, the app tells you so; it never pretends to remove the background.</p>
        </div>
      )}
      {tab === 'about' && (
        <div className="prose">
          <p><strong>Professional Photo Studio</strong> is an original browser-based photo editor and ID photo maker. It is not Adobe Photoshop and is not affiliated with Adobe; it does not read or write PSD files.</p>
          <p>Editable projects are saved as <code>.pps.json</code> (every layer, position, opacity, text, shape and adjustment is kept). JPG, PNG and PDF exports are final pictures.</p>
          <p>Built with React, TypeScript, Vite and the HTML5 Canvas. Images are processed on your computer and never uploaded.</p>
        </div>
      )}
    </Modal>
  );
}

function Prompt({ d }: { d: Extract<NonNullable<ReturnType<typeof ui.getState>['dialog']>, { type: 'prompt' }> }) {
  const [v, setV] = useState(d.value);
  return (
    <Modal title={d.title} width={420} onClose={() => d.resolve(null)} footer={<><Button onClick={() => d.resolve(null)}>Cancel</Button><Button primary onClick={() => d.resolve(v)}>OK</Button></>}>
      <label className="row"><span className="row-label">{d.label}</span>
        <input autoFocus type="text" aria-label={d.label} value={v} onChange={(e) => setV(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => e.key === 'Enter' && d.resolve(v)} />
      </label>
    </Modal>
  );
}

export function DialogHost() {
  const d = useUi((u) => u.dialog);
  if (!d) return null;
  switch (d.type) {
    case 'confirm':
      return <Modal title={d.title} width={440} onClose={() => d.resolve(false)} footer={<><Button onClick={() => d.resolve(false)}>Cancel</Button><Button primary onClick={() => d.resolve(true)}>{d.confirmLabel}</Button></>}><p>{d.message}</p></Modal>;
    case 'prompt':
      return <Prompt d={d} />;
    case 'alert':
      return <Modal title={d.title} width={460} onClose={() => ui.close()} footer={<Button primary onClick={() => ui.close()}>OK</Button>}><p className="pre-wrap">{d.message}</p></Modal>;
    case 'new':
      return <NewDocumentDialog />;
    case 'export':
      return <ExportDialog />;
    case 'projects':
      return <ProjectsDialog tab={d.tab} />;
    case 'resize':
      return <ResizeDialog mode={d.mode} />;
    case 'help':
      return <HelpDialog tab={d.tab} />;
  }
}
