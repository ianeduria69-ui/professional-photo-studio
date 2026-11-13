import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../types';

/** Minimal pixel buffer. The browser's ImageData satisfies this. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function isDefaultAdjustments(a: Adjustments): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]).every((k) => a[k] === DEFAULT_ADJUSTMENTS[k]);
}

/** Stable cache key. */
export function adjustmentsKey(a: Adjustments): string {
  return [
    a.brightness,
    a.contrast,
    a.saturation,
    a.exposure,
    a.temperature,
    a.tint,
    a.hue,
    a.sharpness,
    a.blur,
    a.grayscale ? 1 : 0,
  ].join('|');
}

function applyColor(img: PixelBuffer, a: Adjustments): void {
  const needsColor =
    a.exposure || a.brightness || a.contrast || a.saturation || a.temperature || a.tint || a.hue || a.grayscale;
  if (!needsColor) return;

  const d = img.data;
  const expF = Math.pow(2, a.exposure / 50);
  const bri = a.brightness * 1.275;
  const c = a.contrast * 2.55;
  const contrastF = (259 * (c + 255)) / (255 * (259 - c));
  const tempShift = a.temperature * 0.4;
  const tintShift = a.tint * 0.4;
  const sat = 1 + a.saturation / 100;
  const hueOn = a.hue !== 0;
  const rad = (a.hue * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const m00 = 0.213 + cos * 0.787 - sin * 0.213;
  const m01 = 0.715 - cos * 0.715 - sin * 0.715;
  const m02 = 0.072 - cos * 0.072 + sin * 0.928;
  const m10 = 0.213 - cos * 0.213 + sin * 0.143;
  const m11 = 0.715 + cos * 0.285 + sin * 0.14;
  const m12 = 0.072 - cos * 0.072 - sin * 0.283;
  const m20 = 0.213 - cos * 0.213 - sin * 0.787;
  const m21 = 0.715 - cos * 0.715 + sin * 0.715;
  const m22 = 0.072 + cos * 0.928 + sin * 0.072;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (expF !== 1) {
      r *= expF;
      g *= expF;
      b *= expF;
    }
    if (bri) {
      r += bri;
      g += bri;
      b += bri;
    }
    if (a.contrast) {
      r = (r - 128) * contrastF + 128;
      g = (g - 128) * contrastF + 128;
      b = (b - 128) * contrastF + 128;
    }
    if (tempShift) {
      r += tempShift;
      b -= tempShift;
    }
    if (tintShift) {
      g -= tintShift;
      r += tintShift * 0.25;
      b += tintShift * 0.25;
    }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    if (hueOn) {
      const nr = r * m00 + g * m01 + b * m02;
      const ng = r * m10 + g * m11 + b * m12;
      const nb = r * m20 + g * m21 + b * m22;
      r = nr;
      g = ng;
      b = nb;
    }
    if (a.grayscale) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = l;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

/** Box sizes approximating a gaussian with `n` passes (Kutskir's method). */
function boxesForGauss(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, radius: number, horizontal: boolean) {
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 4 : 4 * w;
  const lineStride = horizontal ? 4 * w : 4;
  const r = Math.min(radius, (n - 1) >> 1);
  if (r < 1) {
    dst.set(src);
    return;
  }
  const inv = 1 / (2 * r + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let c = 0; c < 4; c++) {
      let ti = base + c;
      let li = ti;
      let ri = ti + r * stride;
      const fv = src[base + c];
      const lv = src[base + c + (n - 1) * stride];
      let val = (r + 1) * fv;
      for (let j = 0; j < r; j++) val += src[ti + j * stride];
      for (let j = 0; j <= r; j++) {
        val += src[ri] - fv;
        dst[ti] = Math.round(val * inv);
        ri += stride;
        ti += stride;
      }
      for (let j = r + 1; j < n - r; j++) {
        val += src[ri] - src[li];
        dst[ti] = Math.round(val * inv);
        li += stride;
        ri += stride;
        ti += stride;
      }
      for (let j = n - r; j < n; j++) {
        val += lv - src[li];
        dst[ti] = Math.round(val * inv);
        li += stride;
        ti += stride;
      }
    }
  }
}

/** Gaussian-like blur of all four channels, in place. `sigma` is in buffer pixels. */
export function gaussianBlur(img: PixelBuffer, sigma: number): void {
  if (sigma < 0.3) return;
  const { width: w, height: h } = img;
  let a = img.data;
  let b = new Uint8ClampedArray(a.length);
  for (const size of boxesForGauss(sigma, 3)) {
    const r = (size - 1) / 2;
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  img.data = a;
  void b;
}

function unsharp(img: PixelBuffer, amount: number, sigma: number): void {
  const original = new Uint8ClampedArray(img.data);
  const blurred: PixelBuffer = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  gaussianBlur(blurred, sigma);
  const d = img.data;
  const bl = blurred.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = original[i] + amount * (original[i] - bl[i]);
    d[i + 1] = original[i + 1] + amount * (original[i + 1] - bl[i + 1]);
    d[i + 2] = original[i + 2] + amount * (original[i + 2] - bl[i + 2]);
  }
}

/**
 * Apply all adjustments in place.
 * `pxScale` = buffer pixels per document pixel, so blur/sharpen radii look the
 * same on a down-scaled preview as on the full-resolution export.
 */
export function applyAdjustments(img: PixelBuffer, a: Adjustments, pxScale = 1): void {
  applyColor(img, a);
  if (a.sharpness > 0) unsharp(img, (a.sharpness / 100) * 2, Math.max(0.8, pxScale));
  if (a.blur > 0) gaussianBlur(img, (a.blur * pxScale) / 2);
}
