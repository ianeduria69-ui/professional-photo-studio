import { useEffect, useRef, useState } from 'react';
import { useEditor, useStudio } from '../services/context';
import { pickFile } from '../services/files';
import { ui } from '../services/ui';
import type { Layer } from '../types';
import { Icon, type IconName } from './Icon';
import { Slider } from './ui';

function layerIcon(l: Layer): IconName {
  if (l.kind === 'text') return 'text';
  if (l.kind === 'shape') return l.shape === 'ellipse' ? 'ellipse' : l.shape === 'line' ? 'line' : 'rect';
  return 'image';
}

function LayerRow(props: { layer: Layer; index: number; dragId: string | null; setDragId: (id: string | null) => void }) {
  const { layer: l, index, dragId, setDragId } = props;
  const studio = useStudio();
  const selected = useEditor((s) => s.selectedId === l.id);
  const asset = useEditor((s) => (l.kind === 'image' ? s.doc.assets[l.assetId] : undefined));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(l.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const finish = (save: boolean) => {
    setRenaming(false);
    if (save && name.trim() && name !== l.name) studio.renameLayer(l.id, name);
    else setName(l.name);
  };

  return (
    <li
      className={`layer-row ${selected ? 'selected' : ''} ${l.visible ? '' : 'hidden-layer'} ${over && dragId !== l.id ? 'drop-target' : ''}`}
      draggable={!renaming}
      onDragStart={(e) => {
        setDragId(l.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', l.id);
      }}
      onDragEnd={() => {
        setDragId(null);
        setOver(false);
      }}
      onDragOver={(e) => {
        if (dragId && dragId !== l.id) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragId && dragId !== l.id) studio.reorder(dragId, index);
        setDragId(null);
      }}
      onClick={() => studio.store.select(l.id)}
      aria-selected={selected}
      data-testid="layer-row"
    >
      <button
        className="icon-btn"
        title={l.visible ? 'Hide layer' : 'Show layer'}
        aria-label={l.visible ? 'Hide layer' : 'Show layer'}
        onClick={(e) => {
          e.stopPropagation();
          studio.toggleVisible(l.id);
        }}
      >
        <Icon name={l.visible ? 'eye' : 'eyeOff'} size={15} />
      </button>
      <span className="layer-thumb">{asset ? <img src={asset} alt="" draggable={false} /> : <Icon name={layerIcon(l)} size={15} />}</span>
      {renaming ? (
        <input
          ref={inputRef}
          className="layer-name-input"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true);
            if (e.key === 'Escape') finish(false);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Layer name"
        />
      ) : (
        <span
          className="layer-name"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setName(l.name);
            setRenaming(true);
          }}
          title="Double-click to rename"
        >
          {l.name}
        </span>
      )}
      <button
        className={`icon-btn ${l.locked ? 'on' : ''}`}
        title={l.locked ? 'Unlock layer' : 'Lock layer'}
        aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
        onClick={(e) => {
          e.stopPropagation();
          studio.toggleLock(l.id);
        }}
      >
        <Icon name={l.locked ? 'lock' : 'unlock'} size={15} />
      </button>
    </li>
  );
}

export function LayersPanel() {
  const studio = useStudio();
  const layers = useEditor((s) => s.doc.layers);
  const selected = useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedId));
  const [dragId, setDragId] = useState<string | null>(null);
  const selIndex = selected ? layers.indexOf(selected) : -1;

  const addPictures = async () => {
    const files = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', true);
    for (const f of files) await studio.addImageFile(f);
  };

  return (
    <section className="layers-panel" aria-label="Layers">
      <header>
        <h3>Layers</h3>
        <span className="muted">{layers.length}</span>
      </header>
      <div className="layer-opacity">
        <Slider
          label="Opacity"
          min={0}
          max={100}
          value={selected ? Math.round(selected.opacity * 100) : 100}
          disabled={!selected}
          format={(v) => `${v}%`}
          onInput={(v) => selected && studio.patchLive(selected.id, { opacity: v / 100 })}
          onCommit={() => studio.store.commit()}
        />
      </div>
      <ul className="layer-list">
        {layers
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ l, i }) => (
            <LayerRow key={l.id} layer={l} index={i} dragId={dragId} setDragId={setDragId} />
          ))}
        {layers.length === 0 && <li className="empty">No layers yet. Add a picture, text or shape.</li>}
      </ul>
      <footer className="layer-actions">
        <button className="icon-btn" title="Add text layer" aria-label="Add text layer" onClick={() => studio.addText()}>
          <Icon name="text" />
        </button>
        <button className="icon-btn" title="Add rectangle" aria-label="Add rectangle" onClick={() => studio.addShape('rect')}>
          <Icon name="rect" />
        </button>
        <button className="icon-btn" title="Add ellipse" aria-label="Add ellipse" onClick={() => studio.addShape('ellipse')}>
          <Icon name="ellipse" />
        </button>
        <button className="icon-btn" title="Add picture" aria-label="Add picture" onClick={addPictures}>
          <Icon name="image" />
        </button>
        <span className="spacer" />
        <button className="icon-btn" title="Move layer up" aria-label="Move layer up" disabled={!selected || selIndex >= layers.length - 1} onClick={() => selected && studio.moveLayerOrder(selected.id, 'up')}>
          <Icon name="up" />
        </button>
        <button className="icon-btn" title="Move layer down" aria-label="Move layer down" disabled={!selected || selIndex <= 0} onClick={() => selected && studio.moveLayerOrder(selected.id, 'down')}>
          <Icon name="down" />
        </button>
        <button className="icon-btn" title="Rename layer" aria-label="Rename layer" disabled={!selected} onClick={async () => {
          if (!selected) return;
          const n = await ui.prompt('Rename layer', 'Layer name', selected.name);
          if (n) studio.renameLayer(selected.id, n);
        }}>
          <Icon name="text" size={14} />
        </button>
        <button className="icon-btn" title="Duplicate layer" aria-label="Duplicate layer" disabled={!selected} onClick={() => studio.duplicateSelected()}>
          <Icon name="copy" />
        </button>
        <button className="icon-btn danger" title="Delete layer" aria-label="Delete layer" disabled={!selected} onClick={() => studio.deleteLayer()}>
          <Icon name="trash" />
        </button>
      </footer>
    </section>
  );
}
