import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../src/types';
import {
  adjustmentsKey,
  applyAdjustments,
  gaussianBlur,
  isDefaultAdjustments,
  type PixelBuffer,
} from '../src/image-processing/adjustments';
import {
  eraseSimilarFromPoint,
  estimateBorderBackground,
  removePlainBackground,
} from '../src/image-processing/backgroundRemoval';

function solid(w: number, h: number, rgb: [number, number, number], a = 255): PixelBuffer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = a;
  }
  return { data, width: w, height: h };
}

function setPx(img: PixelBuffer, x: number, y: number, rgb: [number, number, number]) {
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
}

const adj = (p: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUSTMENTS, ...p });
const px = (img: PixelBuffer, x = 0, y = 0) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

test('default adjustments change nothing and are detected', () => {
  const img = solid(4, 4, [10, 120, 200]);
  const before = Array.from(img.data);
  applyAdjustments(img, adj({}));
  assert.deepEqual(Array.from(img.data), before);
  assert.ok(isDefaultAdjustments(adj({})));
  assert.ok(!isDefaultAdjustments(adj({ hue: 5 })));
  assert.notEqual(adjustmentsKey(adj({ blur: 1 })), adjustmentsKey(adj({ blur: 2 })));
});

test('brightness, exposure and contrast move pixels in the right direction', () => {
  const up = solid(2, 2, [100, 100, 100]);
  applyAdjustments(up, adj({ brightness: 20 }));
  assert.ok(up.data[0] > 100);
  const down = solid(2, 2, [100, 100, 100]);
  applyAdjustments(down, adj({ brightness: -20 }));
  assert.ok(down.data[0] < 100);
  const bright = solid(2, 2, [100, 100, 100]);
  applyAdjustments(bright, adj({ exposure: 50 }));
  assert.equal(bright.data[0], 200, '+1 EV doubles the value');
  const c = solid(2, 2, [200, 200, 200]);
  applyAdjustments(c, adj({ contrast: 50 }));
  assert.ok(c.data[0] > 200, 'light pixels get lighter');
  const c2 = solid(2, 2, [50, 50, 50]);
  applyAdjustments(c2, adj({ contrast: 50 }));
  assert.ok(c2.data[0] < 50, 'dark pixels get darker');
});

test('saturation, grayscale, hue, temperature and tint', () => {
  const gray = solid(2, 2, [200, 50, 50]);
  applyAdjustments(gray, adj({ grayscale: true }));
  assert.equal(gray.data[0], gray.data[1]);
  assert.equal(gray.data[1], gray.data[2]);

  const desat = solid(2, 2, [200, 50, 50]);
  applyAdjustments(desat, adj({ saturation: -100 }));
  assert.equal(desat.data[0], desat.data[1]);

  const red = solid(2, 2, [255, 0, 0]);
  applyAdjustments(red, adj({ hue: 120 }));
  assert.ok(red.data[1] > red.data[0], 'red rotated by 120 degrees becomes green-dominant');

  const warm = solid(2, 2, [100, 100, 100]);
  applyAdjustments(warm, adj({ temperature: 50 }));
  assert.ok(warm.data[0] > 100 && warm.data[2] < 100);

  const magenta = solid(2, 2, [100, 100, 100]);
  applyAdjustments(magenta, adj({ tint: 50 }));
  assert.ok(magenta.data[1] < 100);
});

test('alpha is never changed by colour adjustments', () => {
  const img = solid(2, 2, [100, 100, 100], 77);
  applyAdjustments(img, adj({ brightness: 50, contrast: 20, saturation: 30, hue: 40, blur: 2, sharpness: 50 }));
  for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 77);
});

test('blur smooths a hard edge but keeps the average brightness; sharpen increases edge contrast', () => {
  const w = 20;
  const make = () => {
    const img = solid(w, 5, [0, 0, 0]);
    for (let y = 0; y < 5; y++) for (let x = 10; x < w; x++) setPx(img, x, y, [255, 255, 255]);
    return img;
  };
  const blurred = make();
  gaussianBlur(blurred, 2);
  const mid = px(blurred, 10, 2)[0];
  assert.ok(mid > 0 && mid < 255, `edge pixel should be between black and white, got ${mid}`);
  assert.ok(px(blurred, 9, 2)[0] > 0, 'dark side picks up light');
  assert.equal(px(blurred, 0, 2)[0], 0, 'far pixels stay black');
  const avg = (img: PixelBuffer) => {
    let s = 0;
    for (let i = 0; i < img.data.length; i += 4) s += img.data[i];
    return s / (img.data.length / 4);
  };
  assert.ok(Math.abs(avg(blurred) - avg(make())) < 3);

  const soft = make();
  gaussianBlur(soft, 1.5);
  const before = px(soft, 10, 2)[0] - px(soft, 9, 2)[0];
  applyAdjustments(soft, adj({ sharpness: 100 }));
  const after = px(soft, 10, 2)[0] - px(soft, 9, 2)[0];
  assert.ok(after > before, 'edge step is larger after sharpening');

  const viaAdjust = make();
  applyAdjustments(viaAdjust, adj({ blur: 4 }), 1);
  assert.ok(px(viaAdjust, 10, 2)[0] < 255 && px(viaAdjust, 10, 2)[0] > 0);
  const tiny = solid(1, 1, [9, 9, 9]);
  applyAdjustments(tiny, adj({ blur: 5, sharpness: 30 })); // must not crash on 1x1
  assert.equal(tiny.data[3], 255);
});

function subjectOnBlue(): PixelBuffer {
  const img = solid(40, 40, [0, 0, 255]);
  for (let y = 12; y < 28; y++) for (let x = 12; x < 28; x++) setPx(img, x, y, [220, 30, 30]);
  return img;
}

test('plain background removal makes the border colour transparent and keeps the subject', () => {
  const img = subjectOnBlue();
  const r = removePlainBackground(img, 40);
  assert.ok(r.ok, r.reason ?? "removal failed");
  assert.equal(px(img, 0, 0)[3], 0);
  assert.equal(px(img, 39, 39)[3], 0);
  assert.equal(px(img, 5, 20)[3], 0);
  assert.equal(px(img, 20, 20)[3], 255);
  assert.ok(Math.abs(r.removedRatio - (1600 - 256) / 1600) < 0.02);
});

test('the flood fill does not leak into enclosed areas of the same colour', () => {
  const img = subjectOnBlue();
  // a blue "hole" fully enclosed by the red subject
  for (let y = 18; y < 22; y++) for (let x = 18; x < 22; x++) setPx(img, x, y, [0, 0, 255]);
  const r = removePlainBackground(img, 40);
  assert.ok(r.ok);
  assert.equal(px(img, 19, 19)[3], 255, 'enclosed blue stays opaque');
  assert.equal(px(img, 0, 0)[3], 0);
});

test('plain background removal refuses a non-uniform background instead of faking it', () => {
  const img = solid(40, 40, [0, 0, 0]);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if ((x + y) % 2) setPx(img, x, y, [255, 255, 255]);
  const r = removePlainBackground(img, 20);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /not a single plain colour/);
  assert.equal(px(img, 0, 0)[3], 255, 'image is untouched on failure');
});

test('removing everything is reported as a failure', () => {
  const img = solid(30, 30, [10, 10, 10]);
  const r = removePlainBackground(img, 40);
  assert.equal(r.ok, false);
});

test('border estimate and click-to-erase', () => {
  const img = subjectOnBlue();
  const est = estimateBorderBackground(img, 60);
  assert.deepEqual(est.color, [0, 0, 255]);
  assert.ok(est.uniformity > 0.99);

  const r = eraseSimilarFromPoint(img, 20, 20, 30);
  assert.ok(r.ok);
  assert.equal(px(img, 20, 20)[3], 0, 'the clicked red region is erased');
  assert.equal(px(img, 2, 2)[3], 255, 'the blue background is untouched');
  assert.equal(eraseSimilarFromPoint(img, 20, 20, 30).ok, false, 'already transparent');
  assert.equal(eraseSimilarFromPoint(img, -5, 3, 30).ok, false);
});
