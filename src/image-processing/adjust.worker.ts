/// <reference lib="webworker" />
import { applyAdjustments } from './adjustments';
import type { Adjustments } from '../types';

export interface AdjustRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  adjustments: Adjustments;
  pxScale: number;
}

export interface AdjustResponse {
  id: number;
  buffer: ArrayBuffer;
  error?: string;
}

self.onmessage = (ev: MessageEvent<AdjustRequest>) => {
  const { id, width, height, buffer, adjustments, pxScale } = ev.data;
  try {
    const img = { data: new Uint8ClampedArray(buffer), width, height };
    applyAdjustments(img, adjustments, pxScale);
    const out = img.data.buffer as ArrayBuffer;
    (self as unknown as Worker).postMessage({ id, buffer: out } satisfies AdjustResponse, [out]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, buffer, error: (e as Error).message } satisfies AdjustResponse, [buffer]);
  }
};
