import { addLayer, createDocument, createImageLayer } from '../editor/document';
import type { DocumentModel, ImageLayer } from '../types';
import { fitScale } from '../utils/geometry';
import { presetPixelSize, type IdPreset } from './presets';

export const ID_BACKGROUNDS = {
  white: '#ffffff',
  blue: '#1e64c8',
  red: '#d62828',
} as const;

/** Empty ID photo frame at the exact pixel size of `preset` at `dpi`. */
export function makeIdDocument(preset: IdPreset, dpi: number, backgroundColor: string): DocumentModel {
  const px = presetPixelSize(preset, dpi);
  return createDocument({
    name: `ID photo ${preset.label}`,
    width: px.width,
    height: px.height,
    dpi,
    backgroundColor,
  });
}

/** Scale and centre a photo so it covers the whole frame (crop by overflow). */
export function coverFrame(layer: ImageLayer, frameW: number, frameH: number): ImageLayer {
  const s = fitScale(layer.naturalWidth, layer.naturalHeight, frameW, frameH, 'cover');
  const width = layer.naturalWidth * s;
  const height = layer.naturalHeight * s;
  return { ...layer, width, height, x: (frameW - width) / 2, y: (frameH - height) / 2, rotation: 0 };
}

export function withPhoto(
  doc: DocumentModel,
  asset: { assetId: string; dataUrl: string; width: number; height: number },
): DocumentModel {
  const layer = coverFrame(
    createImageLayer({
      assetId: asset.assetId,
      naturalWidth: asset.width,
      naturalHeight: asset.height,
      name: 'Photo',
    }),
    doc.width,
    doc.height,
  );
  const withAsset = { ...doc, assets: { ...doc.assets, [asset.assetId]: asset.dataUrl } };
  return addLayer({ ...withAsset, layers: withAsset.layers.filter((l) => l.kind !== 'image') }, layer);
}

/** Resize the frame to a new preset while keeping the photo covering it. */
export function changeFrame(doc: DocumentModel, preset: IdPreset, dpi: number): DocumentModel {
  const px = presetPixelSize(preset, dpi);
  const layers = doc.layers.map((l) => (l.kind === 'image' ? coverFrame(l, px.width, px.height) : l));
  return { ...doc, width: px.width, height: px.height, dpi, layers, name: `ID photo ${preset.label}` };
}
