import { useDoc, useEditor, useSelectedLayer, useStudio } from '../services/context';
import { ui } from '../services/ui';
import { Button, Section, Slider } from './ui';
import { BG_SWATCHES } from './PropertiesPanel';

/** Image properties plus background removal / replacement. Also used by the ID Photo Maker. */
export function ImagePanel() {
  const studio = useStudio();
  const doc = useDoc();
  const layer = useSelectedLayer();
  const tolerance = useEditor((s) => s.bgTolerance);
  const isImage = layer?.kind === 'image';
  const asset = layer && layer.kind === 'image' ? doc.assets[layer.assetId] : undefined;
  const kb = asset ? Math.round((asset.length * 3) / 4 / 1024) : 0;

  return (
    <>
      <Section title="Image properties">
        {layer && layer.kind === 'image' ? (
          <>
            <dl className="facts">
              <dt>Picture</dt>
              <dd>{layer.naturalWidth} × {layer.naturalHeight} px ({kb.toLocaleString()} KB)</dd>
              <dt>On canvas</dt>
              <dd>{Math.round(layer.width)} × {Math.round(layer.height)} px ({Math.round((layer.width / layer.naturalWidth) * 100)}%)</dd>
              <dt>Effective</dt>
              <dd>{Math.round((layer.naturalWidth / layer.width) * doc.dpi)} DPI at print size</dd>
            </dl>
            <div className="btn-row">
              <Button small onClick={() => studio.resetLayerSize(layer.id)} title="Show the picture at 100% (one picture pixel per canvas pixel)">Actual size</Button>
              <Button small onClick={() => studio.fitLayerToCanvas(layer.id, 'contain')}>Fit canvas</Button>
              <Button small onClick={() => studio.fitLayerToCanvas(layer.id, 'cover')}>Fill canvas</Button>
            </div>
            <div className="btn-row">
              <Button small icon="rotateCcw" onClick={() => studio.rotateLayer90(layer.id, false)} title="Rotate picture 90° counter-clockwise">90°</Button>
              <Button small icon="rotateCw" onClick={() => studio.rotateLayer90(layer.id, true)} title="Rotate picture 90° clockwise">90°</Button>
              <Button small icon="flipH" onClick={() => studio.flipLayer(layer.id, 'h')}>Flip H</Button>
              <Button small icon="flipV" onClick={() => studio.flipLayer(layer.id, 'v')}>Flip V</Button>
            </div>
          </>
        ) : (
          <p className="panel-note">Select a picture layer to see its properties.</p>
        )}
      </Section>

      <Section title="Background removal">
        <Slider label="Tolerance" min={1} max={100} value={tolerance} onInput={(v) => studio.store.set({ bgTolerance: v })} />
        <div className="btn-col">
          <Button disabled={!isImage} icon="wand" onClick={() => void studio.removePlainBackground()} title="Removes a plain, single-colour background starting from the picture edges">
            Remove plain background
          </Button>
          <Button disabled={!isImage} icon="user" onClick={() => void studio.removeBackgroundWithAI()} title="Optional AI model (needs @imgly/background-removal)">
            Remove background (AI)
          </Button>
          <Button disabled={!isImage} icon="picker" onClick={() => studio.store.set({ tool: 'bgremove' })} title="Then click on the picture to erase a similar-colour area">
            Magic eraser (click to erase)
          </Button>
          <Button disabled={!layer || layer.kind !== 'image' || !layer.originalAssetId} onClick={() => studio.restoreOriginalPicture()}>
            Restore original picture
          </Button>
          <Button small onClick={() => ui.open({ type: 'help', tab: 'ai' })}>AI setup instructions…</Button>
        </div>
        <p className="panel-note">The plain remover only works when the background is one colour. For hair and busy backgrounds use the AI remover or finish with the Eraser tool.</p>
      </Section>

      <Section title="Canvas background">
        <div className="btn-row">
          {BG_SWATCHES.map((s) => (
            <button key={s.color} className="swatch-btn" onClick={() => studio.setBackground({ color: s.color, transparent: false })}>
              <span style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
          <button className={`swatch-btn ${doc.background.transparent ? 'active' : ''}`} onClick={() => studio.setBackground({ transparent: true })}>
            <span className="checker" />
            Transparent
          </button>
        </div>
      </Section>
    </>
  );
}
