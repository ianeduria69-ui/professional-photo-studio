import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addGuide,
  addLayer,
  createDocument,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  cropCanvas,
  duplicateLayer,
  flipCanvas,
  moveLayer,
  pruneAssets,
  removeLayer,
  reorderLayer,
  resizeCanvas,
  resizeImage,
  rotateCanvas90,
  updateLayer,
} from '../src/editor/document';
import { History } from '../src/editor/history';
import { EditorStore } from '../src/editor/store';
import { layoutText, normalizeTextLayers, wrapText } from '../src/editor/text';
import { snapBox } from '../src/editor/snapping';
import {
  boxCorners,
  docToAssetPoint,
  hitTestBox,
  localToWorld,
  resizeFromHandle,
  rotationFromPointer,
  worldToLocal,
} from '../src/utils/geometry';
import type { DocumentModel, ImageLayer } from '../src/types';

function docWith3(): DocumentModel {
  let d = createDocument({ width: 400, height: 200, dpi: 300 });
  d = addLayer(d, createShapeLayer('rect', { x: 10, y: 20, width: 50, height: 30, name: 'A' }));
  d = addLayer(d, createShapeLayer('ellipse', { x: 100, y: 40, width: 60, height: 60, name: 'B' }));
  d = addLayer(d, createTextLayer({ x: 200, y: 100, width: 100, text: 'hi', name: 'C' }));
  return d;
}

const approx = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('layers can be added, renamed, duplicated, hidden, locked, deleted and reordered', () => {
  let d = docWith3();
  assert.deepEqual(d.layers.map((l) => l.name), ['A', 'B', 'C']);
  const [a, b, c] = d.layers;

  d = updateLayer(d, a.id, { name: 'Renamed', visible: false, locked: true, opacity: 0.4 });
  assert.equal(d.layers[0].name, 'Renamed');
  assert.equal(d.layers[0].visible, false);
  assert.equal(d.layers[0].locked, true);
  assert.equal(d.layers[0].opacity, 0.4);

  const dup = duplicateLayer(d, b.id);
  assert.ok(dup.newId);
  d = dup.doc;
  assert.equal(d.layers.length, 4);
  assert.equal(d.layers[2].name, 'B copy');
  assert.equal(d.layers[2].x, b.x + 20);

  d = moveLayer(d, c.id, 'bottom');
  assert.equal(d.layers[0].id, c.id);
  d = moveLayer(d, c.id, 'top');
  assert.equal(d.layers[d.layers.length - 1].id, c.id);
  d = moveLayer(d, c.id, 'down');
  assert.equal(d.layers[d.layers.length - 2].id, c.id);
  d = reorderLayer(d, c.id, 0);
  assert.equal(d.layers[0].id, c.id);

  d = removeLayer(d, c.id);
  assert.equal(d.layers.length, 3);
  assert.ok(!d.layers.some((l) => l.id === c.id));
});

test('rotating the canvas 90 degrees four times returns to the original', () => {
  let d = docWith3();
  d = updateLayer(d, d.layers[0].id, { rotation: 30 });
  const original = JSON.stringify(d);
  let r = d;
  for (let i = 0; i < 4; i++) r = rotateCanvas90(r, true);
  assert.equal(r.width, d.width);
  for (let i = 0; i < d.layers.length; i++) {
    approx(r.layers[i].x, d.layers[i].x);
    approx(r.layers[i].y, d.layers[i].y);
    approx(r.layers[i].rotation, d.layers[i].rotation);
  }
  assert.equal(JSON.stringify(d), original, 'input must not be mutated');
  const back = rotateCanvas90(rotateCanvas90(d, true), false);
  approx(back.layers[1].x, d.layers[1].x);
  approx(back.layers[1].y, d.layers[1].y);
});

test('rotate canvas clockwise moves a layer to the right place', () => {
  let d = createDocument({ width: 400, height: 200 });
  d = addLayer(d, createShapeLayer('rect', { x: 10, y: 20, width: 50, height: 30 }));
  const r = rotateCanvas90(d, true);
  assert.deepEqual([r.width, r.height], [200, 400]);
  // centre (35,35) -> (H - cy, cx) = (165, 35)
  approx(r.layers[0].x + 25, 165);
  approx(r.layers[0].y + 15, 35);
  assert.equal(r.layers[0].rotation, 90);
});

test('flipping the canvas twice restores positions and flags', () => {
  const d = docWith3();
  for (const axis of ['h', 'v'] as const) {
    const f = flipCanvas(flipCanvas(d, axis), axis);
    for (let i = 0; i < d.layers.length; i++) {
      approx(f.layers[i].x, d.layers[i].x);
      approx(f.layers[i].y, d.layers[i].y);
      assert.equal(f.layers[i].flipX, d.layers[i].flipX);
      assert.equal(f.layers[i].flipY, d.layers[i].flipY);
    }
  }
  const once = flipCanvas(d, 'h');
  assert.equal(once.layers[0].flipX, true);
  approx(once.layers[0].x, 400 - 10 - 50);
});

test('resize image scales layers, resize canvas keeps them, crop shifts them', () => {
  const d = docWith3();
  const big = resizeImage(d, 800, 400);
  assert.deepEqual([big.width, big.height], [800, 400]);
  assert.equal(big.layers[0].width, 100);
  assert.equal(big.layers[0].x, 20);

  const wider = resizeCanvas(d, 500, 300, 'center');
  assert.equal(wider.layers[0].x, d.layers[0].x + 50);
  assert.equal(wider.layers[0].y, d.layers[0].y + 50);
  const pinned = resizeCanvas(d, 500, 300, 'topleft');
  assert.equal(pinned.layers[0].x, d.layers[0].x);

  const cropped = cropCanvas(addGuide(d, 'v', 120), { x: 100, y: 40, width: 150, height: 100 });
  assert.deepEqual([cropped.width, cropped.height], [150, 100]);
  assert.equal(cropped.layers[1].x, 0);
  assert.equal(cropped.guides[0].position, 20);
});

test('pruneAssets drops pictures no layer uses', () => {
  let d = createDocument({ width: 100, height: 100 });
  d = { ...d, assets: { used: 'data:a', orphan: 'data:b', orig: 'data:c' } };
  d = addLayer(d, { ...createImageLayer({ assetId: 'used', naturalWidth: 10, naturalHeight: 10 }), originalAssetId: 'orig' });
  assert.deepEqual(Object.keys(pruneAssets(d).assets).sort(), ['orig', 'used']);
});

test('history: undo / redo / limit', () => {
  const h = new History<number>(3);
  h.push(1);
  h.push(2);
  h.push(3);
  h.push(4);
  assert.equal(h.undoDepth, 3, 'limit enforced');
  assert.equal(h.undo(5), 4);
  assert.equal(h.undo(4), 3);
  assert.equal(h.redo(3), 4);
  assert.ok(h.canRedo);
  h.push(9);
  assert.ok(!h.canRedo, 'new edit clears redo');
  assert.equal(new History<number>().undo(1), null);
});

test('store: apply, undo, redo, and transient edits collapse to one step', () => {
  const store = new EditorStore(docWith3());
  const id = store.doc.layers[0].id;
  assert.ok(!store.getState().canUndo);

  store.apply((d) => updateLayer(d, id, { x: 99 }));
  assert.equal(store.doc.layers[0].x, 99);
  assert.ok(store.getState().canUndo && store.getState().dirty);

  store.undo();
  assert.equal(store.doc.layers[0].x, 10);
  assert.ok(store.getState().canRedo);
  store.redo();
  assert.equal(store.doc.layers[0].x, 99);

  // a drag: many transient updates, one history entry
  for (let x = 100; x <= 120; x += 5) store.transient((d) => updateLayer(d, id, { x }));
  store.commit();
  assert.equal(store.doc.layers[0].x, 120);
  store.undo();
  assert.equal(store.doc.layers[0].x, 99, 'one undo reverts the whole drag');
  store.undo();
  assert.equal(store.doc.layers[0].x, 10);
  assert.ok(!store.getState().canUndo);
});

test('store: apply commits an open transient edit first, and selection survives undo only if the layer exists', () => {
  const store = new EditorStore(docWith3());
  const [a, b] = store.doc.layers;
  store.select(b.id);
  store.transient((d) => updateLayer(d, a.id, { x: 5 }));
  store.apply((d) => updateLayer(d, a.id, { y: 6 }));
  store.undo();
  assert.equal(store.doc.layers[0].x, 5);
  assert.equal(store.doc.layers[0].y, 20);
  store.apply((d) => removeLayer(d, b.id), { selectedId: null });
  store.select(store.doc.layers[0].id);
  store.undo();
  assert.equal(store.doc.layers.length, 3);
});

test('store: replaceDocument resets history and selection', () => {
  const store = new EditorStore(docWith3());
  store.apply((d) => updateLayer(d, d.layers[0].id, { x: 1 }));
  store.replaceDocument(createDocument({ width: 10, height: 10 }), { projectId: 'p1' });
  assert.ok(!store.getState().canUndo);
  assert.equal(store.getState().projectId, 'p1');
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().selectedId, null);
});

test('store notifies subscribers and returns a new state object per change', () => {
  const store = new EditorStore(docWith3());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  const before = store.getState();
  store.set({ zoom: 2 });
  assert.notEqual(store.getState(), before);
  assert.equal(calls, 1);
  off();
  store.set({ zoom: 3 });
  assert.equal(calls, 1);
});

test('text wrapping and automatic height', () => {
  const measure = (_f: string, t: string) => t.length * 10;
  assert.deepEqual(wrapText('aaa bbb ccc ddd', 'x', 100, measure), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(wrapText('a\n\nb', 'x', 100, measure), ['a', '', 'b']);
  const layer = createTextLayer({ text: 'aaa bbb ccc ddd', width: 100, fontSize: 20, lineHeight: 1.5 });
  const lay = layoutText(layer, measure);
  assert.equal(lay.lines.length, 2);
  assert.equal(lay.height, 60);
  const doc = normalizeTextLayers(addLayer(createDocument({ width: 100, height: 100 }), layer), measure);
  assert.equal(doc.layers[0].height, 60);
  const store = new EditorStore(addLayer(createDocument({ width: 100, height: 100 }), layer), { measure });
  assert.equal(store.doc.layers[0].height, 60);
});

test('geometry: world/local round trip and hit testing on rotated boxes', () => {
  const box = { x: 100, y: 100, width: 200, height: 100, rotation: 90 };
  const w = localToWorld(box, { x: 10, y: 20 });
  const l = worldToLocal(box, w);
  approx(l.x, 10);
  approx(l.y, 20);
  assert.ok(hitTestBox(box, { x: 200, y: 150 }));
  assert.ok(!hitTestBox(box, { x: 290, y: 150 }), 'a point right of a 90deg-rotated wide box is outside');
  assert.ok(hitTestBox(box, { x: 200, y: 240 }));
});

test('geometry: resizing a rotated box keeps the opposite corner fixed', () => {
  const box = { x: 100, y: 100, width: 200, height: 100, rotation: 90 };
  const anchorBefore = boxCorners(box)[0];
  const pointer = localToWorld(box, { x: 300, y: 150 });
  const r = resizeFromHandle(box, 'se', pointer, false);
  approx(r.width, 300);
  approx(r.height, 150);
  const anchorAfter = boxCorners({ ...box, ...r })[0];
  approx(anchorAfter.x, anchorBefore.x, 1e-6);
  approx(anchorAfter.y, anchorBefore.y, 1e-6);

  const plain = { x: 0, y: 0, width: 100, height: 50, rotation: 0 };
  const u = resizeFromHandle(plain, 'se', { x: 200, y: 60 }, true);
  approx(u.width / u.height, 2);
  approx(u.width, 200);
  const nw = resizeFromHandle(plain, 'nw', { x: -50, y: -25 }, false);
  assert.deepEqual([nw.x, nw.y, nw.width, nw.height], [-50, -25, 150, 75]);
  const edge = resizeFromHandle(plain, 'e', { x: 160, y: 999 }, false);
  assert.deepEqual([edge.width, edge.height], [160, 50]);
  const tiny = resizeFromHandle(plain, 'e', { x: -100, y: 0 }, false, 4);
  assert.equal(tiny.width, 4);
});

test('geometry: rotation handle and asset-space mapping', () => {
  const box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
  assert.equal(rotationFromPointer(box, { x: 50, y: -100 }, false), 0);
  assert.equal(rotationFromPointer(box, { x: 200, y: 50 }, false), 90);
  assert.equal(rotationFromPointer(box, { x: 150, y: -40 }, true) % 15, 0);

  const img: ImageLayer = createImageLayer({
    assetId: 'a',
    naturalWidth: 400,
    naturalHeight: 200,
    x: 10,
    y: 10,
    width: 200,
    height: 100,
  });
  const p = docToAssetPoint(img, { x: 110, y: 60 });
  approx(p.x, 200);
  approx(p.y, 100);
  const flipped = docToAssetPoint({ ...img, flipX: true }, { x: 20, y: 60 });
  approx(flipped.x, 400 - 20);
});

test('snapping aligns edges and centres to guides within the threshold only', () => {
  const r = snapBox({ x: 98, y: 50, width: 40, height: 20 }, { v: [100, 500], h: [] }, 5);
  assert.equal(r.dx, 2);
  assert.equal(r.dy, 0);
  assert.deepEqual(r.lines, [{ orientation: 'v', position: 100 }]);
  const none = snapBox({ x: 150, y: 50, width: 40, height: 20 }, { v: [100], h: [] }, 5);
  assert.equal(none.dx, 0);
  const centre = snapBox({ x: 0, y: 0, width: 100, height: 100 }, { v: [52], h: [48] }, 5);
  assert.deepEqual([centre.dx, centre.dy], [2, -2]);
});
