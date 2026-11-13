import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_PRESETS,
  PAPER_SIZES,
  customPreset,
  describePreset,
  paperById,
  paperPixelSize,
  presetById,
  presetFromAspect,
  presetPixelSize,
  toInches,
  toPixels,
} from '../src/id-photo/presets';
import { makeIdDocument } from '../src/id-photo/idDocument';
import { physicalSizeInches } from '../src/editor/document';

const DPI = 300;

test('2x2 inch ID photo is 600x600 px at 300 DPI', () => {
  const p = presetById('2x2in')!;
  assert.deepEqual(presetPixelSize(p, DPI), { width: 600, height: 600 });
});

test('1x1 inch ID photo is 300x300 px at 300 DPI', () => {
  const p = presetById('1x1in')!;
  assert.deepEqual(presetPixelSize(p, DPI), { width: 300, height: 300 });
});

test('passport preset (35x45 mm, configurable) is computed from its physical size', () => {
  const p = presetById('passport-35x45')!;
  assert.equal(p.unit, 'mm');
  // 35 mm = 1.3780 in -> 413.4 px ; 45 mm = 1.7717 in -> 531.5 px
  assert.deepEqual(presetPixelSize(p, DPI), { width: 413, height: 531 });
  assert.equal(describePreset(p), '1.38 × 1.77 in (35 × 45 mm)');
});

test('every preset converts its configured physical size to pixels', () => {
  for (const p of ID_PRESETS) {
    const px = presetPixelSize(p, DPI);
    assert.equal(px.width, Math.round(toInches(p.width, p.unit) * DPI), p.id);
    assert.equal(px.height, Math.round(toInches(p.height, p.unit) * DPI), p.id);
  }
});

test('pixel size scales with DPI', () => {
  const p = presetById('2x2in')!;
  assert.deepEqual(presetPixelSize(p, 150), { width: 300, height: 300 });
  assert.deepEqual(presetPixelSize(p, 600), { width: 1200, height: 1200 });
});

test('custom dimensions in inches, mm and cm', () => {
  assert.deepEqual(presetPixelSize(customPreset(3, 4, 'in'), DPI), { width: 900, height: 1200 });
  assert.deepEqual(presetPixelSize(customPreset(40, 60, 'mm'), DPI), { width: 472, height: 709 });
  assert.deepEqual(presetPixelSize(customPreset(3.5, 4.5, 'cm'), DPI), { width: 413, height: 531 });
});

test('custom aspect ratio derives the height from the width', () => {
  const p = presetFromAspect(3, 4, 3, 'cm');
  assert.equal(p.height, 4);
  assert.deepEqual(presetPixelSize(p, DPI), { width: 354, height: 472 });
  assert.throws(() => presetFromAspect(0, 4, 3, 'cm'));
});

test('paper sizes at 300 DPI', () => {
  const px = (id: string) => paperPixelSize(paperById(id)!, DPI);
  assert.deepEqual(px('4R'), { width: 1200, height: 1800 });
  assert.deepEqual(px('5R'), { width: 1500, height: 2100 });
  assert.deepEqual(px('A4'), { width: 2480, height: 3508 });
  assert.deepEqual(px('letter'), { width: 2550, height: 3300 });
  assert.ok(PAPER_SIZES.length >= 4);
});

test('toPixels never returns less than 1', () => {
  assert.equal(toPixels(0, 'mm', 300), 1);
});

test('an ID document has the preset pixel size and keeps its DPI so print size is exact', () => {
  for (const id of ['2x2in', '1x1in', 'passport-35x45']) {
    const p = presetById(id)!;
    const doc = makeIdDocument(p, DPI, '#ffffff');
    assert.deepEqual({ width: doc.width, height: doc.height }, presetPixelSize(p, DPI));
    const inches = physicalSizeInches(doc);
    // within half a pixel of the nominal physical size
    assert.ok(Math.abs(inches.width - toInches(p.width, p.unit)) <= 0.5 / DPI, id);
    assert.ok(Math.abs(inches.height - toInches(p.height, p.unit)) <= 0.5 / DPI, id);
    assert.equal(doc.dpi, DPI);
  }
});
