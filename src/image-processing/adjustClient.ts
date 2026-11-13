import type { Adjustments } from '../types';
import { applyAdjustments } from './adjustments';
import type { AdjustRequest, AdjustResponse } from './adjust.worker';

/**
 * Runs pixel adjustments off the main thread in a Web Worker. If workers are
 * unavailable (or fail to start) it falls back to the main thread, yielding
 * to the event loop first so the UI can repaint.
 */
export class AdjustClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (b: Uint8ClampedArray) => void; reject: (e: Error) => void }>();

  private ensureWorker(): Worker | null {
    if (this.workerFailed || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    try {
      const w = new Worker(new URL('./adjust.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<AdjustResponse>) => {
        const p = this.pending.get(ev.data.id);
        if (!p) return;
        this.pending.delete(ev.data.id);
        if (ev.data.error) p.reject(new Error(ev.data.error));
        else p.resolve(new Uint8ClampedArray(ev.data.buffer));
      };
      w.onerror = () => {
        this.workerFailed = true;
        for (const [, p] of this.pending) p.reject(new Error('worker crashed'));
        this.pending.clear();
        this.worker = null;
      };
      this.worker = w;
      return w;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  async process(image: ImageData, adjustments: Adjustments, pxScale: number): Promise<ImageData> {
    const w = this.ensureWorker();
    if (w) {
      try {
        const id = this.nextId++;
        const buffer = image.data.buffer.slice(0) as ArrayBuffer;
        const req: AdjustRequest = { id, width: image.width, height: image.height, buffer, adjustments, pxScale };
        const out = await new Promise<Uint8ClampedArray>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          w.postMessage(req, [buffer]);
        });
        return new ImageData(new Uint8ClampedArray(out), image.width, image.height);
      } catch {
        // fall through to main thread
      }
    }
    await new Promise((r) => setTimeout(r, 0));
    const copy = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    applyAdjustments(copy, adjustments, pxScale);
    return copy;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
