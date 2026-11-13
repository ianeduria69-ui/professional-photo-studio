import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAsset,
  addGuide,
  addLayer,
  createDocument,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  updateLayer,
} from '../src/editor/document';
import { PROJECT_FORMAT, ProjectError, parseProject, projectFileName, serializeProject } from '../src/project/format';
import { MemoryStore, ProjectRepository, TemplateRepository, type ProjectRecord, type TemplateRecord } from '../src/project/storage';
import { BUILTIN_TEMPLATES, builtinById } from '../src/templates/builtin';
import { DEFAULT_ADJUSTMENTS, type DocumentModel, type ImageLayer, type ShapeLayer, type TextLayer } from '../src/types';
import { makeIdDocument, withPhoto, changeFrame } from '../src/id-photo/idDocument';
import { presetById } from '../src/id-photo/presets';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function richDocument(): DocumentModel {
  let d = createDocument({ name: 'My design', width: 1200, height: 800, dpi: 300, backgroundColor: '#fafafa' });
  const a1 = addAsset(d, PIXEL);
  d = a1.doc;
  const img: ImageLayer = {
    ...createImageLayer({ assetId: a1.assetId, naturalWidth: 1, naturalHeight: 1, x: 50, y: 60, width: 400, height: 300, name: 'Photo' }),
    rotation: 15,
    flipX: true,
    opacity: 0.8,
    adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 12, contrast: -5, hue: 30, blur: 2, grayscale: true },
    shadow: { enabled: true, color: '#112233', blur: 20, offsetX: 3, offsetY: 7 },
    border: { enabled: true, color: '#ff0000', width: 6 },
  };
  d = addLayer(d, img);
  const txt: TextLayer = createTextLayer({
    text: 'Hello\nWorld',
    x: 100,
    y: 500,
    width: 500,
    fontFamily: 'Georgia',
    fontSize: 72,
    bold: true,
    italic: true,
    color: '#123456',
    align: 'center',
    lineHeight: 1.4,
    name: 'Headline',
  });
  d = addLayer(d, txt);
  const shp: ShapeLayer = createShapeLayer('ellipse', { x: 700, y: 100, width: 200, height: 200, fill: '#00ff00', stroke: '#000000', strokeWidth: 5, name: 'Circle' });
  d = addLayer(d, shp);
  d = addLayer(d, createShapeLayer('rect', { x: 0, y: 0, width: 10, height: 10, cornerRadius: 4, name: 'Hidden' }));
  d = updateLayer(d, d.layers[3].id, { visible: false });
  d = updateLayer(d, d.layers[2].id, { locked: true, opacity: 0.5 });
  d = addGuide(d, 'v', 600);
  d = addGuide(d, 'h', 400);
  return d;
}

test('saving and reopening a project preserves everything, with no flattening', () => {
  const doc = richDocument();
  const json = serializeProject(doc, new Date('2026-01-01T00:00:00Z'));
  const file = JSON.parse(json);
  assert.equal(file.format, PROJECT_FORMAT);
  assert.equal(file.version, 1);
  assert.equal(file.savedAt, '2026-01-01T00:00:00.000Z');

  const back = parseProject(json);
  assert.equal(back.layers.length, 4, 'one entry per layer, not a single flattened picture');
  assert.deepEqual(back.layers.map((l) => l.kind), ['image', 'text', 'shape', 'shape']);
  assert.deepEqual(back, doc, 'document is identical after the round trip');
});

test('layer properties, order, visibility and lock survive reopening', () => {
  const back = parseProject(serializeProject(richDocument()));
  const [img, txt, shp, hidden] = back.layers as [ImageLayer, TextLayer, ShapeLayer, ShapeLayer];
  assert.deepEqual(back.layers.map((l) => l.name), ['Photo', 'Headline', 'Circle', 'Hidden']);

  assert.equal(img.rotation, 15);
  assert.equal(img.flipX, true);
  assert.equal(img.opacity, 0.8);
  assert.equal(img.adjustments.brightness, 12);
  assert.equal(img.adjustments.grayscale, true);
  assert.deepEqual(img.shadow, { enabled: true, color: '#112233', blur: 20, offsetX: 3, offsetY: 7 });
  assert.deepEqual(img.border, { enabled: true, color: '#ff0000', width: 6 });
  assert.equal(back.assets[img.assetId], PIXEL, 'image data embedded');

  assert.equal(txt.text, 'Hello\nWorld');
  assert.equal(txt.fontFamily, 'Georgia');
  assert.equal(txt.bold && txt.italic, true);
  assert.equal(txt.align, 'center');
  assert.equal(txt.lineHeight, 1.4);

  assert.equal(shp.locked, true);
  assert.equal(shp.opacity, 0.5);
  assert.equal(shp.shape, 'ellipse');
  assert.equal(shp.stroke, '#000000');

  assert.equal(hidden.visible, false);
  assert.equal(hidden.cornerRadius, 4);

  assert.equal(back.background.color, '#fafafa');
  assert.equal(back.dpi, 300);
  assert.deepEqual(back.guides.map((g) => [g.orientation, g.position]), [['v', 600], ['h', 400]]);
});

test('unused assets are dropped on save but used ones (including the original of a cut-out) are kept', () => {
  let d = richDocument();
  d = { ...d, assets: { ...d.assets, orphan: PIXEL, original: PIXEL } };
  const img = d.layers[0] as ImageLayer;
  d = updateLayer(d, img.id, { originalAssetId: 'original' });
  const back = parseProject(serializeProject(d));
  assert.ok(!('orphan' in back.assets));
  assert.ok('original' in back.assets);
  assert.equal((back.layers[0] as ImageLayer).originalAssetId, 'original');
});

test('opening an invalid or damaged project gives a clear error', () => {
  assert.throws(() => parseProject('not json'), ProjectError);
  assert.throws(() => parseProject('{"a":1}'), /not a Photo Studio project/);
  assert.throws(() => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: 99, document: {} })), /newer version/);
  const good = JSON.parse(serializeProject(richDocument()));
  const missing = { ...good, document: { ...good.document, assets: {} } };
  assert.throws(() => parseProject(JSON.stringify(missing)), /missing its picture data/);
  const badKind = structuredClone(good);
  badKind.document.layers[0].kind = 'wat';
  assert.throws(() => parseProject(JSON.stringify(badKind)), /unknown type/);
  const badNum = structuredClone(good);
  badNum.document.layers[1].x = 'left';
  assert.throws(() => parseProject(JSON.stringify(badNum)), /Invalid number/);
});

test('older / partial files load with safe defaults', () => {
  const minimal = {
    format: PROJECT_FORMAT,
    version: 1,
    document: {
      width: 100,
      height: 50,
      layers: [{ kind: 'shape', id: 's1', x: 1, y: 2, width: 3, height: 4 }],
    },
  };
  const doc = parseProject(JSON.stringify(minimal));
  const l = doc.layers[0] as ShapeLayer;
  assert.equal(l.visible, true);
  assert.equal(l.opacity, 1);
  assert.equal(l.shadow.enabled, false);
  assert.equal(doc.dpi, 72);
  assert.equal(doc.background.color, '#ffffff');
});

test('project file name is safe', () => {
  assert.equal(projectFileName({ name: 'a/b:c' }), 'a_b_c.pps.json');
  assert.equal(projectFileName({ name: '   ' }), 'project.pps.json');
});

test('project repository: save, list, open, rename, delete (editable after reopening)', async () => {
  const repo = new ProjectRepository(new MemoryStore<ProjectRecord>());
  const doc = richDocument();
  const rec = await repo.save(doc, null, 'data:image/png;base64,xx');
  assert.equal(rec.layerCount, 4);
  assert.equal(rec.name, 'My design');

  const again = await repo.save({ ...doc, name: 'Renamed v2' }, rec.id);
  assert.equal(again.id, rec.id, 'saving over an existing project keeps the id');
  assert.equal((await repo.list()).length, 1);

  const reopened = await repo.open(rec.id);
  assert.equal(reopened.name, 'Renamed v2');
  const edited = updateLayer(reopened, reopened.layers[1].id, { text: 'Edited' });
  assert.equal((edited.layers[1] as TextLayer).text, 'Edited');
  assert.equal(reopened.layers.length, 4, 'still separate layers after reopening');

  await repo.rename(rec.id, 'Third name');
  assert.equal((await repo.open(rec.id)).name, 'Third name');
  await repo.remove(rec.id);
  assert.equal((await repo.list()).length, 0);
  await assert.rejects(() => repo.open(rec.id), /no longer exists/);
});

test('template repository: create, edit, duplicate, delete', async () => {
  const repo = new TemplateRepository(new MemoryStore<TemplateRecord>());
  const t = await repo.save(richDocument(), 'Posters', 'My poster');
  assert.equal(t.name, 'My poster');
  assert.equal(t.category, 'Posters');

  const copy = await repo.duplicate(t.id);
  assert.notEqual(copy.id, t.id);
  assert.equal(copy.name, 'My poster copy');
  assert.equal((await repo.list()).length, 2);

  const doc = await repo.open(t.id);
  await repo.update(t.id, { ...doc, name: 'My poster v2', width: 500 });
  const updated = await repo.open(t.id);
  assert.equal(updated.width, 500);
  assert.equal(updated.name, 'My poster v2');
  assert.equal((await repo.open(copy.id)).width, 1200, 'duplicate is independent');

  await repo.remove(t.id);
  assert.equal((await repo.list()).length, 1);
});

test('every built-in template builds a valid, serialisable document of the right size', () => {
  const expectedCategories = [
    'ID Cards',
    'Business Cards',
    'Certificates',
    'Posters',
    'Invitations',
    'Social Media Posts',
    'Profile Pictures',
    'Product Advertisements',
    'Logo Designs',
  ];
  assert.deepEqual(BUILTIN_TEMPLATES.map((t) => t.category), expectedCategories);
  for (const t of BUILTIN_TEMPLATES) {
    const doc = t.build();
    assert.ok(doc.layers.length >= 2, t.id);
    const back = parseProject(serializeProject(doc));
    assert.equal(back.layers.length, doc.layers.length, t.id);
    assert.equal(back.width, doc.width);
  }
  const id = builtinById('id-card')!.build();

  assert.deepEqual([id.width, id.height, id.dpi], [1013, 638, 300]); // 3.375 x 2.125 in
  const bc = builtinById('business-card')!.build();
  assert.deepEqual([bc.width, bc.height], [1050, 600]); // 3.5 x 2 in
  const inv = builtinById('invitation')!.build();
  assert.deepEqual([inv.width, inv.height], [1500, 2100]); // 5 x 7 in
});

test('ID photo document: photo covers the frame, survives save/reopen and frame changes', () => {
  const preset = presetById('2x2in')!;
  let doc = makeIdDocument(preset, 300, '#1e64c8');
  doc = withPhoto(doc, { assetId: 'a1', dataUrl: PIXEL, width: 800, height: 1200 });
  const photo = doc.layers[0] as ImageLayer;
  assert.equal(doc.layers.length, 1);
  assert.equal(photo.width, 600, 'covers the width');
  assert.equal(photo.height, 900);
  assert.equal(photo.y, -150, 'centred, overflow is cropped');

  const back = parseProject(serializeProject(doc));
  assert.equal(back.background.color, '#1e64c8');
  assert.equal(back.width, 600);
  assert.equal(back.layers.length, 1);

  const passport = changeFrame(doc, presetById('passport-35x45')!, 300);
  assert.deepEqual([passport.width, passport.height], [413, 531]);
  const p2 = passport.layers[0] as ImageLayer;
  assert.ok(p2.width >= 413 - 1e-6 && p2.height >= 531 - 1e-6, 'still covers the new frame');

  // replacing the photo keeps a single photo layer
  const replaced = withPhoto(doc, { assetId: 'a2', dataUrl: PIXEL, width: 100, height: 100 });
  assert.equal(replaced.layers.length, 1);
  assert.equal((replaced.layers[0] as ImageLayer).assetId, 'a2');
});
