import { isDefaultAdjustments } from '../image-processing/adjustments';
import { useSelectedLayer, useStudio } from '../services/context';
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../types';
import { Button, Check, Section, Slider } from './ui';

type NumKey = Exclude<keyof Adjustments, 'grayscale'>;

const SLIDERS: { key: NumKey; label: string; min: number; max: number; step?: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.5 },
];

/** Colour adjustments of the selected picture layer. They are stored on the layer (non-destructive). */
export function AdjustPanel() {
  const studio = useStudio();
  const layer = useSelectedLayer();
  if (!layer || layer.kind !== 'image') {
    return <p className="panel-note">Select a picture layer to adjust its colours. Adjustments stay editable and never change the original pixels.</p>;
  }
  const a = layer.adjustments;
  return (
    <Section
      title="Colour adjustments"
      right={
        <Button small disabled={isDefaultAdjustments(a)} onClick={() => studio.patchAdjustments(layer.id, { ...DEFAULT_ADJUSTMENTS }, false)}>
          Reset
        </Button>
      }
    >
      {SLIDERS.map((s) => (
        <Slider
          key={s.key}
          label={s.label}
          min={s.min}
          max={s.max}
          step={s.step}
          value={a[s.key]}
          onInput={(v) => studio.patchAdjustments(layer.id, { [s.key]: v })}
          onCommit={() => studio.store.commit()}
        />
      ))}
      <Check checked={a.grayscale} onChange={(v) => studio.patchAdjustments(layer.id, { grayscale: v }, false)} label="Grayscale (black & white)" />
    </Section>
  );
}
