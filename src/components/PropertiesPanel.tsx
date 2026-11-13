import { useEffect, useRef, useState } from 'react';
import { useDoc, useSelectedLayer, useStudio, useUi } from '../services/context';
import { FONT_FAMILIES, type Layer, type ShapeLayer, type TextAlign, type TextLayer } from '../types';
import { MM_PER_INCH } from '../id-photo/presets';
import { Button, Check, ColorField, NumberField, Row, Section, Segmented, Select, Slider } from './ui';

export const BG_SWATCHES = [
  { label: 'White', color: '#ffffff' },
  { label: 'Blue', color: '#1e64c8' },
  { label: 'Red', color: '#d62828' },
];

function TextSection({ layer }: { layer: TextLayer }) {
  const studio = useStudio();
  const ref = useRef<HTMLTextAreaElement>(null);
  const focusReq = useUi((u) => u.focusText);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
    ref.current?.select();
  }, [focusReq]);
  const live = (patch: Partial<TextLayer>) => studio.patchLive(layer.id, patch);
  const commit = () => studio.store.commit();
  return (
    <Section title="Text">
      <textarea
        ref={ref}
        className="text-input"
        aria-label="Text content"
        rows={3}
        value={layer.text}
        onChange={(e) => live({ text: e.currentTarget.value })}
        onBlur={commit}
      />
      <Row label="Font">
        <Select
          ariaLabel="Font family"
          value={layer.fontFamily}
          options={FONT_FAMILIES.map((f) => ({ value: f, label: f }))}
          onChange={(v) => studio.patchLayer(layer.id, { fontFamily: v })}
        />
      </Row>
      <Row label="Size">
        <NumberField ariaLabel="Font size" value={layer.fontSize} min={1} max={2000} decimals={1} onChange={(v) => studio.patchLayer(layer.id, { fontSize: v })} />
        <span className="unit">px</span>
      </Row>
      <Row label="Style">
        <button className={`mini ${layer.bold ? 'active' : ''}`} aria-label="Bold" aria-pressed={layer.bold} onClick={() => studio.patchLayer(layer.id, { bold: !layer.bold })}>
          <b>B</b>
        </button>
        <button className={`mini ${layer.italic ? 'active' : ''}`} aria-label="Italic" aria-pressed={layer.italic} onClick={() => studio.patchLayer(layer.id, { italic: !layer.italic })}>
          <i>I</i>
        </button>
      </Row>
      <Row label="Align">
        <Segmented<TextAlign>
          value={layer.align}
          onChange={(v) => studio.patchLayer(layer.id, { align: v })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Row>
      <Row label="Colour">
        <ColorField ariaLabel="Font colour" value={layer.color} onChange={(c) => live({ color: c })} onCommit={commit} />
      </Row>
      <Slider label="Line height" min={0.8} max={3} step={0.05} value={layer.lineHeight} format={(v) => v.toFixed(2)} onInput={(v) => live({ lineHeight: v })} onCommit={commit} />
    </Section>
  );
}

function ShapeSection({ layer }: { layer: ShapeLayer }) {
  const studio = useStudio();
  const live = (patch: Partial<ShapeLayer>) => studio.patchLive(layer.id, patch);
  const commit = () => studio.store.commit();
  const isLine = layer.shape === 'line';
  return (
    <Section title="Shape">
      {!isLine && (
        <Row label="Fill">
          <ColorField
            ariaLabel="Fill colour"
            value={layer.fill ?? '#000000'}
            isNone={layer.fill === null}
            allowNone
            onNone={() => studio.patchLayer(layer.id, { fill: layer.fill === null ? '#2d6cdf' : null })}
            onChange={(c) => live({ fill: c })}
            onCommit={commit}
          />
        </Row>
      )}
      <Row label={isLine ? 'Colour' : 'Stroke'}>
        <ColorField
          ariaLabel="Stroke colour"
          value={layer.stroke ?? '#000000'}
          isNone={layer.stroke === null}
          allowNone={!isLine}
          onNone={() => studio.patchLayer(layer.id, { stroke: layer.stroke === null ? '#111111' : null })}
          onChange={(c) => live({ stroke: c })}
          onCommit={commit}
        />
      </Row>
      <Row label={isLine ? 'Thickness' : 'Stroke width'}>
        <NumberField
          ariaLabel="Stroke width"
          value={layer.strokeWidth}
          min={0}
          max={500}
          decimals={1}
          onChange={(v) =>
            studio.patchLayer(layer.id, isLine ? { strokeWidth: v, height: Math.max(v, 2) } : { strokeWidth: v })
          }
        />
        <span className="unit">px</span>
      </Row>
      {layer.shape === 'rect' && (
        <Row label="Corner radius">
          <NumberField ariaLabel="Corner radius" value={layer.cornerRadius} min={0} max={2000} onChange={(v) => studio.patchLayer(layer.id, { cornerRadius: v })} />
          <span className="unit">px</span>
        </Row>
      )}
    </Section>
  );
}

function AppearanceSection({ layer }: { layer: Layer }) {
  const studio = useStudio();
  const commit = () => studio.store.commit();
  const sh = layer.shadow;
  const bd = layer.border;
  const isLine = layer.kind === 'shape' && layer.shape === 'line';
  return (
    <>
      <Section title="Shadow">
        <Check checked={sh.enabled} onChange={(v) => studio.patchLayer(layer.id, { shadow: { ...sh, enabled: v } })} label="Drop shadow" />
        {sh.enabled && (
          <>
            <Row label="Colour">
              <ColorField ariaLabel="Shadow colour" value={sh.color} onChange={(c) => studio.patchLive(layer.id, { shadow: { ...sh, color: c } })} onCommit={commit} />
            </Row>
            <Slider label="Blur" min={0} max={80} value={sh.blur} onInput={(v) => studio.patchLive(layer.id, { shadow: { ...sh, blur: v } })} onCommit={commit} />
            <Slider label="Offset X" min={-80} max={80} value={sh.offsetX} onInput={(v) => studio.patchLive(layer.id, { shadow: { ...sh, offsetX: v } })} onCommit={commit} />
            <Slider label="Offset Y" min={-80} max={80} value={sh.offsetY} onInput={(v) => studio.patchLive(layer.id, { shadow: { ...sh, offsetY: v } })} onCommit={commit} />
          </>
        )}
      </Section>
      {!isLine && (
        <Section title="Border">
          <Check checked={bd.enabled} onChange={(v) => studio.patchLayer(layer.id, { border: { ...bd, enabled: v } })} label="Border" />
          {bd.enabled && (
            <>
              <Row label="Colour">
                <ColorField ariaLabel="Border colour" value={bd.color} onChange={(c) => studio.patchLive(layer.id, { border: { ...bd, color: c } })} onCommit={commit} />
              </Row>
              <Slider label="Width" min={1} max={100} value={bd.width} onInput={(v) => studio.patchLive(layer.id, { border: { ...bd, width: v } })} onCommit={commit} />
            </>
          )}
        </Section>
      )}
    </>
  );
}

function TransformSection({ layer }: { layer: Layer }) {
  const studio = useStudio();
  const [lockAspect, setLockAspect] = useState(true);
  const isText = layer.kind === 'text';
  const r = (v: number) => Math.round(v * 100) / 100;
  const setW = (w: number) => {
    const ratio = layer.width / Math.max(layer.height, 0.0001);
    if (lockAspect && !isText) studio.patchLayer(layer.id, { width: w, height: w / ratio });
    else studio.patchLayer(layer.id, { width: w });
  };
  const setH = (h: number) => {
    const ratio = layer.width / Math.max(layer.height, 0.0001);
    if (lockAspect) studio.patchLayer(layer.id, { height: h, width: h * ratio });
    else studio.patchLayer(layer.id, { height: h });
  };
  return (
    <Section title="Position & size">
      <div className="grid2">
        <Row label="X">
          <NumberField ariaLabel="X position" value={r(layer.x)} decimals={2} onChange={(v) => studio.patchLayer(layer.id, { x: v })} />
        </Row>
        <Row label="Y">
          <NumberField ariaLabel="Y position" value={r(layer.y)} decimals={2} onChange={(v) => studio.patchLayer(layer.id, { y: v })} />
        </Row>
        <Row label="W">
          <NumberField ariaLabel="Width" value={r(layer.width)} min={1} decimals={2} onChange={setW} />
        </Row>
        <Row label="H">
          <NumberField ariaLabel="Height" value={r(layer.height)} min={1} decimals={2} disabled={isText} onChange={setH} />
        </Row>
        <Row label="Angle">
          <NumberField ariaLabel="Rotation" value={r(layer.rotation)} min={-180} max={180} decimals={1} onChange={(v) => studio.patchLayer(layer.id, { rotation: v })} />
        </Row>
      </div>
      <Check checked={lockAspect} onChange={setLockAspect} label="Keep proportions" disabled={isText} />
      <div className="btn-row">
        <Button small icon="flipH" onClick={() => studio.flipLayer(layer.id, 'h')} title="Flip layer horizontally">Flip H</Button>
        <Button small icon="flipV" onClick={() => studio.flipLayer(layer.id, 'v')} title="Flip layer vertically">Flip V</Button>
        <Button small icon="rotateCw" onClick={() => studio.rotateLayer90(layer.id)} title="Rotate layer 90° clockwise">90°</Button>
      </div>
      <div className="btn-row">
        <Button small onClick={() => studio.centerLayer(layer.id, 'both')} title="Center on the canvas">Center</Button>
        <Button small onClick={() => studio.fitLayerToCanvas(layer.id, 'contain')} title="Scale to fit inside the canvas">Fit</Button>
        <Button small onClick={() => studio.fitLayerToCanvas(layer.id, 'cover')} title="Scale to cover the whole canvas">Fill</Button>
      </div>
    </Section>
  );
}

function DocumentSection() {
  const studio = useStudio();
  const doc = useDoc();
  const inW = doc.width / doc.dpi;
  const inH = doc.height / doc.dpi;
  const [name, setName] = useState(doc.name);
  useEffect(() => setName(doc.name), [doc.name]);
  return (
    <Section title="Document">
      <Row label="Name">
        <input
          type="text"
          value={name}
          aria-label="Document name"
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => (name.trim() ? studio.renameDocument(name) : setName(doc.name))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </Row>
      <Row label="Canvas">
        <span className="readout">{doc.width} × {doc.height} px</span>
      </Row>
      <Row label="Resolution">
        <NumberField ariaLabel="Document DPI" value={doc.dpi} min={1} max={2400} onChange={(v) => studio.setDpi(v)} />
        <span className="unit">DPI</span>
      </Row>
      <Row label="Print size">
        <span className="readout">
          {inW.toFixed(2)} × {inH.toFixed(2)} in ({(inW * MM_PER_INCH).toFixed(1)} × {(inH * MM_PER_INCH).toFixed(1)} mm)
        </span>
      </Row>
      <Row label="Background">
        <ColorField ariaLabel="Canvas colour" value={doc.background.color} onChange={(c) => studio.setBackground({ color: c, transparent: false })} />
      </Row>
      <div className="btn-row">
        {BG_SWATCHES.map((s) => (
          <button key={s.color} className="swatch-btn" onClick={() => studio.setBackground({ color: s.color, transparent: false })} title={`${s.label} background`}>
            <span style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <button className={`swatch-btn ${doc.background.transparent ? 'active' : ''}`} onClick={() => studio.setBackground({ transparent: !doc.background.transparent })} title="Transparent background (PNG keeps it)">
          <span className="checker" />
          None
        </button>
      </div>
    </Section>
  );
}

export function PropertiesPanel() {
  const layer = useSelectedLayer();
  if (!layer) {
    return (
      <>
        <DocumentSection />
        <p className="panel-note">Select a layer to edit its position, size, text, colours, shadow and border.</p>
      </>
    );
  }
  return (
    <>
      <TransformSection layer={layer} />
      {layer.kind === 'text' && <TextSection layer={layer} />}
      {layer.kind === 'shape' && <ShapeSection layer={layer} />}
      <AppearanceSection layer={layer} />
    </>
  );
}
