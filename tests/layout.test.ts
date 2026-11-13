import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSheetLayout, faceGuide, type SheetSettings } from '../src/id-photo/layout';
import { paperById, paperPixelSize, presetById, presetPixelSize } from '../src/id-photo/presets';

const DPI = 300;

function settings(paperId: string, presetId: string, extra: Partial<SheetSettings> = {}): SheetSettings {
  const paper = paperPixelSize(paperById(paperId)!, DPI);
  const photo = presetPixelSize(presetById(presetId)!, DPI);
  return {
    paperWidthPx: paper.width,
    paperHeightPx: paper.height,
    photoWidthPx: photo.width,
    photoHeightPx: photo.height,
    marginPx: 0,
    gapPx: 0,
    copies: 'fill',
    autoRotate: false,
    ...extra,
  };
}

test('4R holds 2x3 = 6 two-inch photos and 4x6 = 24 one-inch photos with no margins', () => {
  const a = computeSheetLayout(settings('4R', '2x2in'));
  assert.equal(a.paperWidthPx, 1200);
  assert.equal(a.paperHeightPx, 1800);
  assert.deepEqual([a.cols, a.rows, a.capacity], [2, 3, 6]);
  const b = computeSheetLayout(settings('4R', '1x1in'));
  assert.deepEqual([b.cols, b.rows, b.capacity], [4, 6, 24]);
});

test('A4 with 0.25in margin and 0.1in gap fits 3x5 two-inch photos', () => {
  const l = computeSheetLayout(settings('A4', '2x2in', { marginPx: 75, gapPx: 30 }));
  assert.deepEqual([l.cols, l.rows, l.capacity], [3, 5, 15]);
});

test('placements stay inside the margins, never overlap and respect the gap', () => {
  const s = settings('A4', '2x2in', { marginPx: 75, gapPx: 30 });
  const l = computeSheetLayout(s);
  assert.equal(l.placements.length, 15);
  for (const p of l.placements) {
    assert.ok(p.x >= s.marginPx && p.y >= s.marginPx);
    assert.ok(p.x + p.width <= l.paperWidthPx - s.marginPx);
    assert.ok(p.y + p.height <= l.paperHeightPx - s.marginPx);
    assert.equal(p.width, 600);
    assert.equal(p.height, 600);
  }
  for (let i = 0; i < l.placements.length; i++) {
    for (let j = i + 1; j < l.placements.length; j++) {
      const a = l.placements[i];
      const b = l.placements[j];
      const separated =
        a.x + a.width + s.gapPx <= b.x ||
        b.x + b.width + s.gapPx <= a.x ||
        a.y + a.height + s.gapPx <= b.y ||
        b.y + b.height + s.gapPx <= a.y;
      assert.ok(separated, `photo ${i} and ${j} overlap or are closer than the gap`);
    }
  }
});

test('requested copies are honoured and overflow is reported', () => {
  const few = computeSheetLayout(settings('4R', '2x2in', { copies: 4 }));
  assert.equal(few.count, 4);
  assert.equal(few.overflow, 0);
  const many = computeSheetLayout(settings('4R', '2x2in', { copies: 10 }));
  assert.equal(many.count, 6);
  assert.equal(many.overflow, 4);
});

test('the block of photos is centred on the paper', () => {
  const l = computeSheetLayout(settings('4R', '2x2in', { copies: 'fill', marginPx: 0 }));
  const minX = Math.min(...l.placements.map((p) => p.x));
  const maxX = Math.max(...l.placements.map((p) => p.x + p.width));
  assert.equal(minX, l.paperWidthPx - maxX);
});

test('auto-rotate turns the paper to landscape when more photos fit', () => {
  const s: SheetSettings = {
    paperWidthPx: 1200,
    paperHeightPx: 1800,
    photoWidthPx: 1700,
    photoHeightPx: 500,
    marginPx: 0,
    gapPx: 0,
    copies: 'fill',
    autoRotate: true,
  };
  const l = computeSheetLayout(s);
  assert.equal(l.rotated, true);
  assert.equal(l.paperWidthPx, 1800);
  assert.equal(l.paperHeightPx, 1200);
  assert.equal(l.capacity, 2);
  assert.equal(computeSheetLayout({ ...s, autoRotate: false }).capacity, 0);
});

test('a photo larger than the paper gives an empty layout, not a crash', () => {
  const l = computeSheetLayout(settings('4R', '2x2in', { photoWidthPx: 5000, photoHeightPx: 5000 }));
  assert.equal(l.capacity, 0);
  assert.equal(l.placements.length, 0);
});

test('face guide is symmetric and inside the frame', () => {
  const g = faceGuide(600, 600);
  assert.equal(g.centerX, 300);
  assert.ok(g.headTopY > 0 && g.chinY < 600 && g.eyeLineY > g.headTopY && g.eyeLineY < g.chinY);
  assert.ok(g.centerX - g.radiusX > 0 && g.centerX + g.radiusX < 600);
});
