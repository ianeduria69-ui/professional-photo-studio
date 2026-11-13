import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EditorState } from '../editor/store';
import { AdjustPanel } from '../components/AdjustPanel';
import { Icon } from '../components/Icon';
import { ImagePanel } from '../components/ImagePanel';
import { OptionsBar } from '../components/OptionsBar';
import { StatusBar } from '../components/StatusBar';
import { Toasts } from '../components/Toasts';
import { ToolBar } from '../components/ToolBar';
import { Button, Check, ColorField, NumberField, Row, Section, Segmented, Select, Slider } from '../components/ui';
import { Workspace, type DocOverlay } from '../components/Workspace';
import { encodeCanvas, renderDocumentToCanvas, type ExportFormat } from '../export/exporter';
import { canvasSizeProblem } from '../export/size';
import { parseProject, projectFileName, serializeProject } from '../project/format';
import { StudioContext, useDoc, useEditor } from '../services/context';
import { downloadBlob, importImageFile, pickFile } from '../services/files';
import { Studio, errorMessage } from '../services/studio';
import { ui } from '../services/ui';
import { fitScale } from '../utils/geometry';
import { uid } from '../utils/id';
import { changeFrame, ID_BACKGROUNDS, makeIdDocument, withPhoto } from './idDocument';
import { computeSheetLayout, faceGuide } from './layout';
import {
  customPreset, describePreset, ID_PRESETS, MM_PER_INCH, PAPER_SIZES, presetFromAspect, presetPixelSize, toInches,
  paperPixelSize, type IdPreset, type PaperSize,
} from './presets';
import { drawSheet } from './sheet';
import { loadUserPresets, saveUserPresets } from './savedPresets';

type Unit3 = 'in' | 'mm' | 'cm';
const UNITS: { value: Unit3; label: string }[] = [{ value: 'in', label: 'inches' }, { value: 'mm', label: 'mm' }, { value: 'cm', label: 'cm' }];
const BG_CHOICES = [
  { key: 'white', label: 'White', color: ID_BACKGROUNDS.white },
  { key: 'blue', label: 'Blue', color: ID_BACKGROUNDS.blue },
  { key: 'red', label: 'Red', color: ID_BACKGROUNDS.red },
];

function SheetPreview(props: { studio: Studio; paper: { width: number; height: number }; layoutArgs: Parameters<typeof computeSheetLayout>[0]; cutMarks: boolean; dpi: number }) {
  const { studio, layoutArgs, cutMarks, dpi } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const doc = useDoc();
  const revision = useEditor((s) => s.revision);
  const layout = useMemo(() => computeSheetLayout(layoutArgs), [layoutArgs]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const k = 300 / Math.max(layout.paperWidthPx, layout.paperHeightPx);
    canvas.width = Math.max(1, Math.round(layout.paperWidthPx * k));
    canvas.height = Math.max(1, Math.round(layout.paperHeightPx * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // small render of the single photo, reused for every tile
    const tile = document.createElement('canvas');
    const tk = Math.min(1, 240 / Math.max(doc.width, doc.height));
    tile.width = Math.max(1, Math.round(doc.width * tk));
    tile.height = Math.max(1, Math.round(doc.height * tk));
    const tctx = tile.getContext('2d');
    if (!tctx) return;
    studio.cache.sync(doc);
    tctx.scale(tk, tk);
    import('../editor/renderer').then(({ renderDocument }) => {
      renderDocument(tctx, doc, { provider: studio.cache, quality: 'preview', drawBackground: true, pixelScale: tk });
      ctx.save();
      ctx.scale(k, k);
      drawSheet(ctx, layout, tile, { paperColor: '#ffffff', cutMarks, dpi: dpi * k });
      ctx.restore();
    });
  }, [doc, layout, cutMarks, dpi, revision, studio]);
  return <canvas ref={ref} className="sheet-preview" data-testid="sheet-preview" aria-label="Print sheet preview" />;
}

export function IdPhotoMaker(props: { editor: Studio }) {
  const { editor } = props;
  const initial = ID_PRESETS[0];
  const studio = useMemo(() => {
    const s = new Studio(makeIdDocument(initial, 300, ID_BACKGROUNDS.white));
    s.store.set({ showRulers: false, snap: true });
    return s;
  }, [initial]);
  useEffect(() => () => studio.dispose(), [studio]);

  // ---- frame (preset) state
  const [userPresets, setUserPresets] = useState<IdPreset[]>(() => loadUserPresets());
  const [presetId, setPresetId] = useState(initial.id);
  const [customW, setCustomW] = useState(2);
  const [customH, setCustomH] = useState(2.5);
  const [customUnit, setCustomUnit] = useState<Unit3>('in');
  const [aspW, setAspW] = useState(3);
  const [aspH, setAspH] = useState(4);
  const [aspWidth, setAspWidth] = useState(1.5);
  const [aspUnit, setAspUnit] = useState<Unit3>('in');
  const [dpi, setDpi] = useState(300);
  const [showGuide, setShowGuide] = useState(true);

  const preset: IdPreset = useMemo(() => {
    if (presetId === 'custom-size') return customPreset(customW, customH, customUnit);
    if (presetId === 'custom-aspect') return presetFromAspect(aspW, aspH, aspWidth, aspUnit);
    return userPresets.find((p) => p.id === presetId) ?? ID_PRESETS.find((p) => p.id === presetId) ?? initial;
  }, [presetId, customW, customH, customUnit, aspW, aspH, aspWidth, aspUnit, userPresets, initial]);

  const px = presetPixelSize(preset, dpi);
  useEffect(() => {
    const d = studio.store.doc;
    if (d.width === px.width && d.height === px.height && d.dpi === dpi) return;
    studio.store.apply((doc) => changeFrame(doc, preset, dpi));
    studio.fit();
  }, [px.width, px.height, dpi, preset, studio]);

  const doc = useDoc2(studio);
  const bgColor = doc.background.color;

  // ---- photo
  const loadPhoto = useCallback(async (file: File) => {
    await studio.run('Loading photo…', async () => {
      const imp = await importImageFile(file);
      const assetId = uid('asset');
      studio.store.apply((d) => withPhoto(d, { assetId, dataUrl: imp.dataUrl, width: imp.width, height: imp.height }));
      const layer = studio.store.doc.layers.find((l) => l.kind === 'image');
      if (layer) studio.store.select(layer.id);
      studio.store.set({ tool: 'move' });
    });
  }, [studio]);
  const upload = async () => {
    const [f] = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp');
    if (f) await loadPhoto(f);
  };

  // ---- face guides overlay
  const overlay: DocOverlay = useCallback((ctx, d, onePx) => {
    ctx.save();
    ctx.lineWidth = 1.5 * onePx;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.setLineDash([6 * onePx, 5 * onePx]);
    ctx.strokeRect(0, 0, d.width, d.height);
    if (showGuide) {
      const g = faceGuide(d.width, d.height);
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 2;
      ctx.strokeStyle = '#19d3c5';
      ctx.beginPath();
      ctx.ellipse(g.centerX, (g.headTopY + g.chinY) / 2, g.radiusX, g.radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffd24a';
      ctx.beginPath();
      ctx.moveTo(0, g.eyeLineY); ctx.lineTo(d.width, g.eyeLineY);
      ctx.moveTo(g.centerX, 0); ctx.lineTo(g.centerX, d.height);
      ctx.moveTo(g.centerX - g.radiusX, g.chinY); ctx.lineTo(g.centerX + g.radiusX, g.chinY);
      ctx.moveTo(d.width * 0.12, g.shoulderY); ctx.lineTo(d.width * 0.88, g.shoulderY);
      ctx.stroke();
    }
    ctx.restore();
  }, [showGuide]);

  // ---- photo position controls
  const photo = doc.layers.find((l) => l.kind === 'image');
  const photoLayer = useEditor2(studio, (s) => s.doc.layers.find((l) => l.id === s.selectedId));
  const canUndo = useEditor2(studio, (s) => s.canUndo);
  const canRedo = useEditor2(studio, (s) => s.canRedo);
  const cover = photo && photo.kind === 'image' ? fitScale(photo.naturalWidth, photo.naturalHeight, doc.width, doc.height, 'cover') : 1;
  const zoomPct = photo && photo.kind === 'image' ? Math.round((photo.width / (photo.naturalWidth * cover)) * 100) : 100;
  const setPhotoZoom = (pct: number) => {
    if (!photo || photo.kind !== 'image') return;
    const w = photo.naturalWidth * cover * (pct / 100);
    const h = photo.naturalHeight * cover * (pct / 100);
    const cx = photo.x + photo.width / 2;
    const cy = photo.y + photo.height / 2;
    studio.patchLive(photo.id, { width: w, height: h, x: cx - w / 2, y: cy - h / 2 });
  };

  // ---- sheet settings
  const [paperId, setPaperId] = useState('4R');
  const [paperW, setPaperW] = useState(6);
  const [paperH, setPaperH] = useState(8);
  const [paperUnit, setPaperUnit] = useState<Unit3>('in');
  const [marginUnit, setMarginUnit] = useState<'mm' | 'in'>('mm');
  const [margin, setMargin] = useState(3);
  const [gap, setGap] = useState(2);
  const [copies, setCopies] = useState(6);
  const [fill, setFill] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cutMarks, setCutMarks] = useState(true);
  const [quality, setQuality] = useState(0.95);

  const paper: PaperSize = paperId === 'custom' ? { id: 'custom', label: 'Custom', width: paperW, height: paperH, unit: paperUnit } : (PAPER_SIZES.find((p) => p.id === paperId) ?? PAPER_SIZES[0]);
  const paperPx = paperPixelSize(paper, dpi);
  const layoutArgs = useMemo(
    () => ({
      paperWidthPx: paperPx.width,
      paperHeightPx: paperPx.height,
      photoWidthPx: doc.width,
      photoHeightPx: doc.height,
      marginPx: Math.round(toInches(margin, marginUnit) * dpi),
      gapPx: Math.round(toInches(gap, marginUnit) * dpi),
      copies: fill ? ('fill' as const) : copies,
      autoRotate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paperPx.width, paperPx.height, doc.width, doc.height, margin, gap, marginUnit, dpi, fill, copies, autoRotate],
  );
  const layout = useMemo(() => computeSheetLayout(layoutArgs), [layoutArgs]);
  const sheetProblem = canvasSizeProblem(layout.paperWidthPx, layout.paperHeightPx);

  // ---- export
  const exportSingle = async (format: ExportFormat) => {
    if (!photo) return studio.toast('Upload a photo first.');
    await studio.exportDoc({ format, quality, dpi: doc.dpi });
  };
  const exportSheet = async (format: ExportFormat) => {
    if (!photo) return studio.toast('Upload a photo first.');
    if (layout.count === 0) return studio.toast('No photo fits on this paper. Reduce the margins or choose bigger paper.', 'error');
    await studio.run('Building print sheet…', async () => {
      const photoCanvas = await renderDocumentToCanvas(studio.store.doc, studio.cache, doc.dpi, '#ffffff');
      const sheet = document.createElement('canvas');
      sheet.width = layout.paperWidthPx;
      sheet.height = layout.paperHeightPx;
      const ctx = sheet.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available.');
      drawSheet(ctx, layout, photoCanvas, { paperColor: '#ffffff', cutMarks, dpi: doc.dpi });
      const r = await encodeCanvas(sheet, { format, quality, dpi: doc.dpi }, `${doc.name} sheet ${paper.id === 'custom' ? `${paper.width}x${paper.height}${paper.unit}` : paper.id}`);
      downloadBlob(r.blob, r.filename);
      studio.toast(`Print sheet ${r.filename}: ${r.width} × ${r.height} px at ${r.dpi} DPI (${(r.width / r.dpi).toFixed(2)} × ${(r.height / r.dpi).toFixed(2)} in), ${layout.count} photo(s).`, 'success');
    });
  };

  // ---- project
  const saveProjectFile = () => {
    downloadBlob(new Blob([serializeProject(studio.store.doc)], { type: 'application/json' }), projectFileName(studio.store.doc));
    studio.toast('Editable ID photo project downloaded (.pps.json).', 'success');
  };
  const openProjectFile = async () => {
    const [f] = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const d = parseProject(await f.text());
      setDpi(d.dpi);
      setCustomW(Math.round((d.width / d.dpi) * 1000) / 1000);
      setCustomH(Math.round((d.height / d.dpi) * 1000) / 1000);
      setCustomUnit('in');
      setPresetId('custom-size');
      studio.loadDocument(d);
      const l = d.layers.find((x) => x.kind === 'image');
      if (l) studio.store.select(l.id);
    } catch (e) {
      studio.toast(errorMessage(e), 'error');
    }
  };
  const sendToEditor = async () => {
    if (editor.store.state.dirty && !(await ui.confirm('Replace the editor document?', 'The editor has unsaved changes. Sending the ID photo replaces them.', 'Replace'))) return;
    editor.loadDocument(structuredClone(studio.store.doc));
    ui.setView('editor');
  };
  const savePreset = async () => {
    const name = await ui.prompt('Save preset', 'Preset name', preset.label);
    if (!name?.trim()) return;
    const p: IdPreset = { id: uid('user'), label: name.trim(), width: preset.width, height: preset.height, unit: preset.unit, note: 'Your saved preset' };
    const list = [...userPresets, p];
    setUserPresets(list);
    saveUserPresets(list);
    setPresetId(p.id);
  };
  const deletePreset = () => {
    const list = userPresets.filter((p) => p.id !== presetId);
    setUserPresets(list);
    saveUserPresets(list);
    setPresetId(initial.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || ui.getState().dialog) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) studio.store.redo(); else studio.store.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); studio.store.redo(); }
      else if (e.key === 'Delete' && photoLayer) { studio.deleteLayer(); }
      else if (e.key.startsWith('Arrow') && photoLayer) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        studio.nudge(e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio, photoLayer]);

  const isUser = userPresets.some((p) => p.id === presetId);
  const inW = toInches(preset.width, preset.unit);
  const inH = toInches(preset.height, preset.unit);

  return (
    <StudioContext.Provider value={studio}>
      <div className="id-maker" role="dialog" aria-label="ID Photo Maker">
        <header className="id-head">
          <Icon name="idcard" size={20} />
          <h1>ID Photo Maker</h1>
          <span className="spacer" />
          <Button small icon="undo" disabled={!canUndo} onClick={() => studio.store.undo()}>Undo</Button>
          <Button small icon="redo" disabled={!canRedo} onClick={() => studio.store.redo()}>Redo</Button>
          <Button small icon="folder" onClick={openProjectFile}>Open project…</Button>
          <Button small icon="save" onClick={saveProjectFile}>Save project</Button>
          <Button small onClick={sendToEditor}>Open in full editor</Button>
          <Button small primary onClick={() => ui.setView('editor')}>Back to editor</Button>
        </header>

        <div className="id-body">
          <aside className="id-left">
            <Section title="1 · Photo">
              <Button primary icon="upload" onClick={upload}>{photo ? 'Replace portrait photo…' : 'Upload portrait photo…'}</Button>
              <p className="panel-note">JPG, PNG or WebP. You can also drop a file on the preview.</p>
            </Section>

            <Section title="2 · Size">
              <Row label="Preset">
                <Select value={presetId} ariaLabel="ID photo preset" onChange={setPresetId} options={[
                  ...ID_PRESETS.map((p) => ({ value: p.id, label: p.label })),
                  ...userPresets.map((p) => ({ value: p.id, label: `★ ${p.label}` })),
                  { value: 'custom-size', label: 'Custom size…' },
                  { value: 'custom-aspect', label: 'Custom aspect ratio…' },
                ]} />
              </Row>
              {presetId === 'custom-size' && (
                <>
                  <Row label="Width"><NumberField ariaLabel="Custom width" value={customW} min={0.1} decimals={3} onChange={setCustomW} /></Row>
                  <Row label="Height"><NumberField ariaLabel="Custom height" value={customH} min={0.1} decimals={3} onChange={setCustomH} /></Row>
                  <Row label="Unit"><Select value={customUnit} ariaLabel="Custom unit" onChange={setCustomUnit} options={UNITS} /></Row>
                </>
              )}
              {presetId === 'custom-aspect' && (
                <>
                  <Row label="Ratio"><NumberField ariaLabel="Aspect width part" value={aspW} min={0.1} decimals={2} onChange={setAspW} /> : <NumberField ariaLabel="Aspect height part" value={aspH} min={0.1} decimals={2} onChange={setAspH} /></Row>
                  <Row label="Width"><NumberField ariaLabel="Aspect photo width" value={aspWidth} min={0.1} decimals={3} onChange={setAspWidth} /></Row>
                  <Row label="Unit"><Select value={aspUnit} ariaLabel="Aspect unit" onChange={setAspUnit} options={UNITS} /></Row>
                </>
              )}
              <Row label="Resolution"><Select value={String(dpi)} ariaLabel="Photo DPI" onChange={(v) => setDpi(parseInt(v, 10))} options={[{ value: '300', label: '300 DPI (print)' }, { value: '600', label: '600 DPI (high)' }, { value: '150', label: '150 DPI (draft)' }]} /></Row>
              <p className="panel-note" data-testid="preset-info">
                Physical size: <strong>{describePreset(preset)}</strong><br />
                Pixels at {dpi} DPI: <strong data-testid="preset-px">{px.width} × {px.height} px</strong><br />
                {preset.note ?? ''}
              </p>
              <div className="btn-row">
                <Button small onClick={savePreset}>Save as preset…</Button>
                {isUser && <Button small danger onClick={deletePreset}>Delete preset</Button>}
              </div>
              <p className="panel-note">Presets are common defaults, not official rules. Passport and ID requirements differ per agency (including Philippine agencies): confirm the exact size and head position with the office that will accept the photo. Edit or save your own preset above.</p>
            </Section>

            <Section title="3 · Position">
              <Slider label="Zoom photo" min={20} max={500} value={zoomPct} disabled={!photo} format={(v) => `${v}%`} onInput={setPhotoZoom} onCommit={() => studio.store.commit()} />
              <Slider label="Tilt" min={-30} max={30} step={0.5} value={photo?.rotation ?? 0} disabled={!photo} format={(v) => `${v}°`} onInput={(v) => photo && studio.patchLive(photo.id, { rotation: v })} onCommit={() => studio.store.commit()} />
              <div className="btn-row">
                <Button small disabled={!photo} onClick={() => photo && studio.fitLayerToCanvas(photo.id, 'cover')}>Fill frame</Button>
                <Button small disabled={!photo} onClick={() => photo && studio.fitLayerToCanvas(photo.id, 'contain')}>Fit inside</Button>
                <Button small disabled={!photo} onClick={() => photo && studio.centerLayer(photo.id)}>Center</Button>
                <Button small disabled={!photo} icon="flipH" onClick={() => photo && studio.flipLayer(photo.id, 'h')}>Mirror</Button>
              </div>
              <Check checked={showGuide} onChange={setShowGuide} label="Show face positioning guides" />
              <p className="panel-note">Drag the photo to move it, use the corner handles to resize. Put the eyes near the yellow line and the chin near the bottom of the oval. The guide is only a rule of thumb and is never exported.</p>
            </Section>

            <Section title="4 · Background">
              <div className="btn-row">
                {BG_CHOICES.map((b) => (
                  <button key={b.key} className={`swatch-btn ${bgColor === b.color ? 'active' : ''}`} onClick={() => studio.setBackground({ color: b.color, transparent: false })}>
                    <span style={{ background: b.color }} />{b.label}
                  </button>
                ))}
              </div>
              <Row label="Custom"><ColorField ariaLabel="Custom background colour" value={bgColor} onChange={(c) => studio.setBackground({ color: c, transparent: false })} /></Row>
              <p className="panel-note">The colour shows behind the person only after the old background is removed (below). If the photo already has a plain background, use “Remove plain background”.</p>
            </Section>

            <ImagePanel />
            <AdjustPanel />
          </aside>

          <section className="id-center" aria-label="ID photo preview">
            <OptionsBar />
            <div className="id-stage">
              <ToolBar only={['move', 'eraser', 'bgremove']} hideUpload />
              <div className="id-canvas">
                <Workspace overlay={overlay} hint={false} onFiles={(files) => { const f = files.find((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp)$/i.test(x.name)); if (f) void loadPhoto(f); }} />
                {!photo && <div className="empty-hint"><strong>Upload a portrait photo</strong><span>Then drag it into place using the guides</span></div>}
              </div>
            </div>
          </section>

          <aside className="id-right">
            <Section title="5 · Print sheet">
              <Row label="Paper">
                <Select value={paperId} ariaLabel="Paper size" onChange={setPaperId} options={[...PAPER_SIZES.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom size…' }]} />
              </Row>
              {paperId === 'custom' && (
                <>
                  <Row label="Width"><NumberField ariaLabel="Paper width" value={paperW} min={0.5} decimals={2} onChange={setPaperW} /></Row>
                  <Row label="Height"><NumberField ariaLabel="Paper height" value={paperH} min={0.5} decimals={2} onChange={setPaperH} /></Row>
                  <Row label="Unit"><Select value={paperUnit} ariaLabel="Paper unit" onChange={setPaperUnit} options={UNITS} /></Row>
                </>
              )}
              <Row label="Spacing unit"><Segmented value={marginUnit} onChange={(u) => { setMarginUnit(u); setMargin(u === 'mm' ? 3 : 0.12); setGap(u === 'mm' ? 2 : 0.08); }} options={[{ value: 'mm', label: 'mm' }, { value: 'in', label: 'inch' }]} /></Row>
              <Row label="Margin"><NumberField ariaLabel="Margin" value={margin} min={0} decimals={2} onChange={setMargin} /> {marginUnit}</Row>
              <Row label="Gap"><NumberField ariaLabel="Gap between photos" value={gap} min={0} decimals={2} onChange={setGap} /> {marginUnit}</Row>
              <Row label="Copies"><NumberField ariaLabel="Copies" value={copies} min={1} max={500} disabled={fill} onChange={setCopies} /></Row>
              <Check checked={fill} onChange={setFill} label="Fill the whole page" />
              <Check checked={autoRotate} onChange={setAutoRotate} label="Auto-rotate paper to fit more" />
              <Check checked={cutMarks} onChange={setCutMarks} label="Cutting guide lines" />
              <SheetPreview studio={studio} paper={paperPx} layoutArgs={layoutArgs} cutMarks={cutMarks} dpi={dpi} />
              <p className="panel-note" data-testid="sheet-info">
                Sheet: <strong>{layout.paperWidthPx} × {layout.paperHeightPx} px</strong> = {(layout.paperWidthPx / dpi).toFixed(2)} × {(layout.paperHeightPx / dpi).toFixed(2)} in ({((layout.paperWidthPx / dpi) * MM_PER_INCH).toFixed(1)} × {((layout.paperHeightPx / dpi) * MM_PER_INCH).toFixed(1)} mm){layout.rotated ? ', landscape' : ''}.<br />
                <strong data-testid="sheet-count">{layout.count}</strong> photo(s) placed ({layout.cols} × {layout.rows} fit, capacity {layout.capacity}).
                {layout.overflow > 0 && <span className="error-text"> {layout.overflow} copies do not fit on one sheet.</span>}
                {sheetProblem && <span className="error-text"> {sheetProblem}</span>}
              </p>
            </Section>
            <Section title="6 · Export">
              <Slider label="JPG / PDF quality" min={0.5} max={1} step={0.01} value={quality} format={(v) => `${Math.round(v * 100)}%`} onInput={setQuality} />
              <p className="panel-note">Single photo: {px.width} × {px.height} px at {doc.dpi} DPI = {inW.toFixed(2)} × {inH.toFixed(2)} in.</p>
              <div className="btn-row">
                <Button small icon="download" onClick={() => exportSingle('png')}>Photo PNG</Button>
                <Button small icon="download" onClick={() => exportSingle('jpg')}>Photo JPG</Button>
                <Button small icon="download" onClick={() => exportSingle('pdf')}>Photo PDF</Button>
              </div>
              <div className="btn-row">
                <Button primary small icon="print" disabled={!!sheetProblem} onClick={() => exportSheet('jpg')}>Sheet JPG</Button>
                <Button primary small icon="print" disabled={!!sheetProblem} onClick={() => exportSheet('png')}>Sheet PNG</Button>
                <Button primary small icon="print" disabled={!!sheetProblem} onClick={() => exportSheet('pdf')}>Sheet PDF</Button>
              </div>
              <p className="panel-note">Print at 100% / “Actual size” (not “Fit to page”) so the photos keep their physical size.</p>
            </Section>
          </aside>
        </div>
        <StatusBar />
        <Toasts />
      </div>
    </StudioContext.Provider>
  );
}

// Hooks bound to an explicit studio (the Provider is rendered by this component itself).
function useEditor2<T>(studio: Studio, sel: (s: EditorState) => T): T {
  return useSyncExternalStore(studio.store.subscribe, () => sel(studio.store.getState()));
}
function useDoc2(studio: Studio) {
  return useEditor2(studio, (s) => s.doc);
}
