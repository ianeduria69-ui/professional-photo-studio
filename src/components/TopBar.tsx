import { useEffect, useRef, useState } from 'react';
import { useEditor, useStudio } from '../services/context';
import { pickFile } from '../services/files';
import { ui } from '../services/ui';
import { Icon } from './Icon';

interface Item {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

function Menu(props: { name: string; items: Item[]; open: boolean; setOpen: (n: string | null) => void; anyOpen: boolean }) {
  const { name, items, open, setOpen, anyOpen } = props;
  return (
    <div className="menu">
      <button className={open ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(open ? null : name)} onMouseEnter={() => anyOpen && setOpen(name)}>
        {name}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it, i) =>
            it.separator ? (
              <hr key={i} />
            ) : (
              <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(null); it.onClick?.(); }}>
                <span className="chk">{it.checked ? '✓' : ''}</span>
                <span className="lbl">{it.label}</span>
                <span className="kbd">{it.shortcut}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const studio = useStudio();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const st = useEditor((s) => s);
  const sel = st.doc.layers.find((l) => l.id === st.selectedId);
  const hasSel = !!sel;
  const isImg = sel?.kind === 'image';

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const addPictures = async () => {
    const files = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', true);
    for (const f of files) await studio.addImageFile(f);
  };
  const sep: Item = { separator: true };
  const D = st.doc;

  const menus: { name: string; items: Item[] }[] = [
    { name: 'File', items: [
      { label: 'New…', shortcut: 'Ctrl+N', onClick: () => ui.open({ type: 'new' }) },
      { label: 'New from Template…', onClick: () => ui.open({ type: 'projects', tab: 'templates' }) },
      { label: 'ID Photo Maker…', onClick: () => ui.setView('id') },
      sep,
      { label: 'Open Image as Document…', onClick: async () => { const [f] = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'); if (f) await studio.openImageAsDocument(f); } },
      { label: 'Open Project File…', onClick: async () => { const [f] = await pickFile('.json,application/json'); if (f) await studio.openProjectFile(f); } },
      { label: 'My Projects…', onClick: () => ui.open({ type: 'projects', tab: 'projects' }) },
      sep,
      { label: st.templateId ? 'Save Template' : 'Save in Browser', shortcut: 'Ctrl+S', onClick: () => void studio.saveProject() },
      { label: 'Save As…', onClick: async () => { const n = await ui.prompt('Save project as', 'Project name', D.name); if (n?.trim()) await studio.saveProjectAs(n.trim()); } },
      { label: 'Download Project File (.pps.json)', onClick: () => studio.downloadProject() },
      { label: 'Save as Template…', onClick: () => ui.open({ type: 'projects', tab: 'templates' }) },
      sep,
      { label: 'Export (JPG / PNG / PDF)…', shortcut: 'Ctrl+E', onClick: () => ui.open({ type: 'export' }) },
    ] },
    { name: 'Edit', items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !st.canUndo, onClick: () => studio.store.undo() },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !st.canRedo, onClick: () => studio.store.redo() },
      sep,
      { label: 'Duplicate Layer', shortcut: 'Ctrl+D', disabled: !hasSel, onClick: () => studio.duplicateSelected() },
      { label: 'Delete Layer', shortcut: 'Del', disabled: !hasSel, onClick: () => studio.deleteLayer() },
      sep,
      { label: 'Fill Selection with Foreground', disabled: !st.selection, onClick: () => studio.fillSelection() },
      { label: 'Erase Selection from Picture', disabled: !st.selection || !isImg, onClick: () => void studio.eraseSelection() },
    ] },
    { name: 'Image', items: [
      { label: 'Image Size…', onClick: () => ui.open({ type: 'resize', mode: 'image' }) },
      { label: 'Canvas Size…', onClick: () => ui.open({ type: 'resize', mode: 'canvas' }) },
      sep,
      { label: 'Rotate Canvas 90° Clockwise', onClick: () => studio.rotateCanvas(true) },
      { label: 'Rotate Canvas 90° Counter-clockwise', onClick: () => studio.rotateCanvas(false) },
      { label: 'Flip Canvas Horizontal', onClick: () => studio.flipCanvasAxis('h') },
      { label: 'Flip Canvas Vertical', onClick: () => studio.flipCanvasAxis('v') },
      sep,
      { label: 'Crop Tool', shortcut: 'C', onClick: () => studio.store.set({ tool: 'crop' }) },
      { label: 'Crop to Selection', disabled: !st.selection, onClick: () => studio.cropToSelection() },
      sep,
      { label: 'Canvas Colour: White', onClick: () => studio.setBackground({ color: '#ffffff', transparent: false }) },
      { label: 'Canvas Colour: Blue', onClick: () => studio.setBackground({ color: '#1e64c8', transparent: false }) },
      { label: 'Canvas Colour: Red', onClick: () => studio.setBackground({ color: '#d62828', transparent: false }) },
      { label: 'Canvas Colour: Transparent', checked: D.background.transparent, onClick: () => studio.setBackground({ transparent: true }) },
    ] },
    { name: 'Layer', items: [
      { label: 'New Text Layer', onClick: () => studio.addText() },
      { label: 'New Rectangle', onClick: () => studio.addShape('rect') },
      { label: 'New Ellipse', onClick: () => studio.addShape('ellipse') },
      { label: 'New Line', onClick: () => studio.addShape('line') },
      { label: 'New Paint Layer', onClick: () => void studio.addPaintLayer() },
      { label: 'Add Picture…', onClick: addPictures },
      sep,
      { label: 'Duplicate', disabled: !hasSel, onClick: () => studio.duplicateSelected() },
      { label: 'Delete', disabled: !hasSel, onClick: () => studio.deleteLayer() },
      { label: 'Rename…', disabled: !hasSel, onClick: async () => { if (!sel) return; const n = await ui.prompt('Rename layer', 'Layer name', sel.name); if (n) studio.renameLayer(sel.id, n); } },
      { label: sel?.visible === false ? 'Show' : 'Hide', disabled: !hasSel, onClick: () => sel && studio.toggleVisible(sel.id) },
      { label: sel?.locked ? 'Unlock' : 'Lock', disabled: !hasSel, onClick: () => sel && studio.toggleLock(sel.id) },
      sep,
      { label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', disabled: !hasSel, onClick: () => sel && studio.moveLayerOrder(sel.id, 'top') },
      { label: 'Bring Forward', shortcut: 'Ctrl+]', disabled: !hasSel, onClick: () => sel && studio.moveLayerOrder(sel.id, 'up') },
      { label: 'Send Backward', shortcut: 'Ctrl+[', disabled: !hasSel, onClick: () => sel && studio.moveLayerOrder(sel.id, 'down') },
      { label: 'Send to Back', shortcut: 'Ctrl+Shift+[', disabled: !hasSel, onClick: () => sel && studio.moveLayerOrder(sel.id, 'bottom') },
      sep,
      { label: 'Flip Horizontal', disabled: !hasSel, onClick: () => sel && studio.flipLayer(sel.id, 'h') },
      { label: 'Flip Vertical', disabled: !hasSel, onClick: () => sel && studio.flipLayer(sel.id, 'v') },
      { label: 'Rotate 90° Clockwise', disabled: !hasSel, onClick: () => sel && studio.rotateLayer90(sel.id) },
      { label: 'Center on Canvas', disabled: !hasSel, onClick: () => sel && studio.centerLayer(sel.id) },
    ] },
    { name: 'Select', items: [
      { label: 'All', shortcut: 'Ctrl+A', onClick: () => studio.selectAll() },
      { label: 'Deselect', shortcut: 'Esc', disabled: !st.selection, onClick: () => studio.deselect() },
      { label: 'Layer Bounds', disabled: !hasSel, onClick: () => studio.selectLayerBounds() },
      sep,
      { label: 'Next Layer', onClick: () => studio.selectRelative(1) },
      { label: 'Previous Layer', onClick: () => studio.selectRelative(-1) },
      { label: 'Deselect Layer', disabled: !hasSel, onClick: () => studio.store.select(null) },
    ] },
    { name: 'View', items: [
      { label: 'Zoom In', shortcut: 'Ctrl++', onClick: () => studio.zoomBy(1.25) },
      { label: 'Zoom Out', shortcut: 'Ctrl+−', onClick: () => studio.zoomBy(1 / 1.25) },
      { label: 'Fit on Screen', shortcut: 'Ctrl+0', onClick: () => studio.fit() },
      { label: 'Actual Pixels (100%)', shortcut: 'Ctrl+1', onClick: () => studio.actualSize() },
      sep,
      { label: 'Rulers', checked: st.showRulers, onClick: () => studio.store.set({ showRulers: !st.showRulers }) },
      { label: 'Guides', checked: st.showGuides, onClick: () => studio.store.set({ showGuides: !st.showGuides }) },
      { label: 'Snap', checked: st.snap, onClick: () => studio.store.set({ snap: !st.snap }) },
      { label: 'Add Vertical Guide at Center', onClick: () => studio.addGuideAt('v', D.width / 2) },
      { label: 'Add Horizontal Guide at Center', onClick: () => studio.addGuideAt('h', D.height / 2) },
      { label: 'Clear Guides', disabled: D.guides.length === 0, onClick: () => studio.clearGuides() },
    ] },
    { name: 'Help', items: [
      { label: 'Keyboard Shortcuts', onClick: () => ui.open({ type: 'help', tab: 'shortcuts' }) },
      { label: 'Background Removal Setup', onClick: () => ui.open({ type: 'help', tab: 'ai' }) },
      { label: 'About Photo Studio', onClick: () => ui.open({ type: 'help', tab: 'about' }) },
    ] },
  ];

  return (
    <header className="topbar" ref={ref}>
      <div className="brand" title="Professional Photo Studio (original app, not affiliated with Adobe)">
        <Icon name="image" size={18} /> <strong>Photo Studio</strong>
      </div>
      <nav className="menus" aria-label="Main menu">
        {menus.map((m) => (
          <Menu key={m.name} name={m.name} items={m.items} open={open === m.name} setOpen={setOpen} anyOpen={open !== null} />
        ))}
      </nav>
      <div className="spacer" />
      <div className="top-actions">
        <button className="btn small" onClick={() => ui.setView('id')} title="Open the ID Photo Maker"><Icon name="idcard" size={15} /> ID Photo Maker</button>
        <button className="btn small" onClick={() => ui.open({ type: 'projects', tab: 'templates' })} title="Templates"><Icon name="template" size={15} /> Templates</button>
        <span className="sep" />
        <button className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!st.canUndo} onClick={() => studio.store.undo()}><Icon name="undo" /></button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!st.canRedo} onClick={() => studio.store.redo()}><Icon name="redo" /></button>
        <button className="icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => studio.zoomBy(1 / 1.25)}><Icon name="zoomOut" /></button>
        <span className="zoom-readout" data-testid="zoom">{Math.round(st.zoom * 100)}%</span>
        <button className="icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => studio.zoomBy(1.25)}><Icon name="zoomIn" /></button>
        <button className="icon-btn" title="Fit on screen" aria-label="Fit on screen" onClick={() => studio.fit()}><Icon name="fit" /></button>
        <span className="sep" />
        <button className="btn small" onClick={() => void studio.saveProject()} title="Save in this browser (Ctrl+S)"><Icon name="save" size={15} /> Save</button>
        <button className="btn small primary" onClick={() => ui.open({ type: 'export' })} title="Export JPG / PNG / PDF (Ctrl+E)"><Icon name="export" size={15} /> Export</button>
      </div>
    </header>
  );
}
