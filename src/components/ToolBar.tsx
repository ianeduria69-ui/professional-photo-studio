import { useEditor, useStudio } from '../services/context';
import { pickFile } from '../services/files';
import type { ToolId } from '../types';
import { Icon, type IconName } from './Icon';

const TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'move', icon: 'move', label: 'Move', key: 'V' },
  { id: 'select', icon: 'select', label: 'Selection', key: 'M' },
  { id: 'crop', icon: 'crop', label: 'Crop', key: 'C' },
  { id: 'brush', icon: 'brush', label: 'Brush', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
  { id: 'shape', icon: 'shape', label: 'Shape', key: 'U' },
  { id: 'bgremove', icon: 'wand', label: 'Background removal (magic eraser)', key: 'W' },
  { id: 'picker', icon: 'picker', label: 'Colour picker', key: 'I' },
];

export function ToolBar(props: { only?: ToolId[]; hideUpload?: boolean }) {
  const studio = useStudio();
  const tool = useEditor((s) => s.tool);
  const fg = useEditor((s) => s.fg);
  const bg = useEditor((s) => s.bg);
  const tools = props.only ? TOOLS.filter((t) => props.only?.includes(t.id)) : TOOLS;
  const upload = async () => {
    const files = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', true);
    for (const f of files) await studio.addImageFile(f);
  };
  const setTool = (id: ToolId) => {
    if (id !== 'crop') studio.cancelCrop();
    studio.store.set({ tool: id });
  };
  return (
    <nav className="toolbar" aria-label="Tools">
      {tools.map((t) => (
        <button key={t.id} className={`tool ${tool === t.id ? 'active' : ''}`} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
          <Icon name={t.icon} size={20} />
        </button>
      ))}
      {!props.hideUpload && (
        <button className="tool" title="Upload picture (Ctrl+O adds as new document)" aria-label="Image upload" onClick={upload}>
          <Icon name="upload" size={20} />
        </button>
      )}
      <div className="spacer" />
      <div className="swatches" title="Foreground / background colour">
        <label className="sw bgc" style={{ background: bg }} title="Background colour">
          <input type="color" aria-label="Background colour" value={bg} onChange={(e) => studio.store.set({ bg: e.currentTarget.value })} />
        </label>
        <label className="sw fgc" style={{ background: fg }} title="Foreground colour (brush, text, shapes)">
          <input type="color" aria-label="Foreground colour" value={fg} onChange={(e) => studio.store.set({ fg: e.currentTarget.value })} />
        </label>
        <button className="swap" title="Swap colours (X)" aria-label="Swap colours" onClick={() => studio.store.set({ fg: bg, bg: fg })}>
          <Icon name="swap" size={12} />
        </button>
      </div>
    </nav>
  );
}
