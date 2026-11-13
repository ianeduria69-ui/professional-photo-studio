import { AdjustClient } from '../image-processing/adjustClient';
import { adjustmentsKey, isDefaultAdjustments } from '../image-processing/adjustments';
import type { DocumentModel, ImageLayer } from '../types';
import type { ImageProvider, ImageQuality } from './renderer';

export type Source = HTMLImageElement | HTMLCanvasElement;

/** Longest side (px) of the adjusted copy used while editing. Export always uses full resolution. */
const PREVIEW_MAX = 1600;

interface Processed {
  key: string;
  canvas: HTMLCanvasElement;
}

/**
 * Decodes assets once, and keeps adjusted (brightness, blur, ...) copies so the
 * heavy pixel work is NOT repeated on every repaint. Adjusted copies are made in
 * a Web Worker; while one is being computed the previous result (or the raw
 * picture) is shown.
 */
export class ImageCache implements ImageProvider {
  private assets: Record<string, string> = {};
  private readonly sources = new Map<string, Source>();
  private readonly loading = new Map<string, Promise<Source>>();
  private readonly processed = new Map<string, Processed>();
  private readonly wanted = new Map<string, string>();
  private readonly running = new Set<string>();
  private readonly overrides = new Map<string, HTMLCanvasElement>();
  private readonly client = new AdjustClient();
  private disposed = false;

  constructor(private readonly onChange: () => void) {}

  /** Tell the cache which assets exist and drop everything the document no longer uses. */
  sync(doc: DocumentModel): void {
    this.assets = doc.assets;
    const usedAssets = new Set<string>();
    const usedLayers = new Set<string>();
    for (const l of doc.layers) {
      if (l.kind !== 'image') continue;
      usedAssets.add(l.assetId);
      usedLayers.add(l.id);
    }
    for (const id of [...this.sources.keys()]) if (!usedAssets.has(id)) this.sources.delete(id);
    for (const key of [...this.processed.keys()]) {
      if (!usedLayers.has(key.split('|')[0])) {
        this.processed.delete(key);
        this.wanted.delete(key);
      }
    }
    for (const id of [...this.overrides.keys()]) if (!usedLayers.has(id)) this.overrides.delete(id);
  }

  getSource(assetId: string): Source | undefined {
    return this.sources.get(assetId);
  }

  /** Use an already-drawn canvas as the decoded picture of an asset (avoids a re-decode flicker). */
  registerSource(assetId: string, source: Source): void {
    this.sources.set(assetId, source);
  }

  setOverride(layerId: string, canvas: HTMLCanvasElement): void {
    this.overrides.set(layerId, canvas);
  }

  clearOverride(layerId: string): void {
    this.overrides.delete(layerId);
  }

  loadAsset(assetId: string): Promise<Source> {
    const have = this.sources.get(assetId);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(assetId);
    if (pending) return pending;
    const url = this.assets[assetId];
    if (!url) return Promise.reject(new Error('Picture data is missing.'));
    const p = new Promise<Source>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The picture could not be decoded.'));
      img.src = url;
    })
      .then((img) => {
        this.sources.set(assetId, img);
        this.loading.delete(assetId);
        return img;
      })
      .catch((e) => {
        this.loading.delete(assetId);
        throw e;
      });
    this.loading.set(assetId, p);
    return p;
  }

  private target(layer: ImageLayer, src: Source, quality: ImageQuality): { w: number; h: number; pxScale: number } {
    const sw = src.width;
    const sh = src.height;
    const k = quality === 'preview' ? Math.min(1, PREVIEW_MAX / Math.max(sw, sh)) : 1;
    const w = Math.max(1, Math.round(sw * k));
    const h = Math.max(1, Math.round(sh * k));
    return { w, h, pxScale: w / Math.max(1, layer.width) };
  }

  getImage(layer: ImageLayer, quality: ImageQuality): CanvasImageSource | null {
    const override = this.overrides.get(layer.id);
    if (override) return override;

    const src = this.sources.get(layer.assetId);
    if (!src) {
      this.loadAsset(layer.assetId).then(
        () => !this.disposed && this.onChange(),
        () => undefined,
      );
      return null;
    }
    if (isDefaultAdjustments(layer.adjustments)) return src;

    const t = this.target(layer, src, quality);
    const slot = `${layer.id}|${quality}`;
    const key = `${layer.assetId}|${adjustmentsKey(layer.adjustments)}|${t.w}x${t.h}|${t.pxScale.toFixed(3)}`;
    const have = this.processed.get(slot);
    if (have && have.key === key) return have.canvas;

    this.wanted.set(slot, key);
    if (!this.running.has(slot)) void this.run(slot, layer, src, t);
    return have ? have.canvas : src;
  }

  private async run(slot: string, layer: ImageLayer, src: Source, t: { w: number; h: number; pxScale: number }): Promise<void> {
    this.running.add(slot);
    let result: Processed | null = null;
    try {
      const key = this.wanted.get(slot) as string;
      result = { key, canvas: await this.process(src, layer, t) };
    } catch {
      // keep showing the unadjusted picture if processing fails
    }
    // Release the slot BEFORE notifying, so the repaint can start a newer job
    // if the sliders moved while this one was running.
    this.running.delete(slot);
    if (this.disposed || !result) return;
    this.processed.set(slot, result);
    this.onChange();
  }

  private async process(src: Source, layer: ImageLayer, t: { w: number; h: number; pxScale: number }): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = t.w;
    canvas.height = t.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, t.w, t.h);
    const data = ctx.getImageData(0, 0, t.w, t.h);
    const out = await this.client.process(data, layer.adjustments, t.pxScale);
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  /** Load every picture and compute every adjusted copy at FULL resolution (for export). */
  async prepareFull(doc: DocumentModel): Promise<void> {
    this.assets = doc.assets;
    const jobs: Promise<void>[] = [];
    for (const l of doc.layers) {
      if (l.kind !== 'image' || !l.visible) continue;
      jobs.push(
        (async () => {
          const src = await this.loadAsset(l.assetId);
          if (isDefaultAdjustments(l.adjustments)) return;
          const t = this.target(l, src, 'full');
          const key = `${l.assetId}|${adjustmentsKey(l.adjustments)}|${t.w}x${t.h}|${t.pxScale.toFixed(3)}`;
          const slot = `${l.id}|full`;
          if (this.processed.get(slot)?.key === key) return;
          const canvas = await this.process(src, l, t);
          this.processed.set(slot, { key, canvas });
        })(),
      );
    }
    await Promise.all(jobs);
  }

  dispose(): void {
    this.disposed = true;
    this.client.dispose();
    this.sources.clear();
    this.processed.clear();
    this.overrides.clear();
  }
}
