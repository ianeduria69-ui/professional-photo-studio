import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/claude/professional-photo-studio/');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const S = '/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad';
const results = [];
const errs = [];
async function step(name, fn) { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { results.push(['FAIL', name, e.message]); await pg.screenshot({ path: S + '/fail-' + results.length + '.png' }).catch(()=>{}); console.log(e.message.slice(0,400)); console.log('FAIL', name, '-', e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m||'') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const pg = await ctx.newPage();
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await pg.goto('http://localhost:5199/'); await pg.waitForTimeout(500);
const st = (fn) => pg.evaluate(fn);
const docInfo = () => pg.evaluate(() => { const s = window.__studio.store.state; return { w: s.doc.width, h: s.doc.height, dpi: s.doc.dpi, layers: s.doc.layers.map(l => ({ name: l.name, kind: l.kind, visible: l.visible, locked: l.locked, opacity: l.opacity, x: l.x, y: l.y, w: l.width, h: l.height })), undo: s.canUndo, redo: s.canRedo, busy: s.busy }; });
async function download(trigger, name) { const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), trigger()]); const f = S + '/dl-' + name; await d.saveAs(f); return { file: f, suggested: d.suggestedFilename() }; }
async function menu(top, item) { await pg.getByRole('button', { name: top, exact: true }).first().click(); await pg.getByRole('menuitem', { name: item }).first().click(); }
async function idle() { await pg.waitForFunction(() => !window.__studio.store.state.busy, null, { timeout: 30000 }); await pg.waitForTimeout(100); }
const screenOf = (dx, dy) => pg.evaluate(([dx, dy]) => { const s = window.__studio.store.state; const r = document.querySelector('.viewport').getBoundingClientRect(); return { x: r.left + s.panX + dx * s.zoom, y: r.top + s.panY + dy * s.zoom }; }, [dx, dy]);

await step('upload JPG via Upload tool', async () => {
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Image upload' }).click()]);
  await fc.setFiles(S + '/portrait.jpg'); await pg.waitForSelector('[data-testid=layer-row]'); await idle();
  const d = await docInfo(); eq(d.layers.length, 1, 'layers'); eq(d.layers[0].kind, 'image');
});
await step('crop tool: drag, Enter applies, undo restores', async () => {
  await pg.getByRole('button', { name: 'Crop', exact: true }).click();
  const a = await screenOf(100, 100), b = await screenOf(500, 400);
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2); await pg.mouse.move(b.x, b.y); await pg.mouse.up();
  await pg.keyboard.press('Enter');
  let d = await docInfo(); eq([d.w, d.h], [400, 300], 'cropped size');
  await pg.keyboard.press('Control+z'); d = await docInfo(); eq([d.w, d.h], [1200, 800], 'undo');
  await pg.keyboard.press('Control+Shift+z'); d = await docInfo(); eq([d.w, d.h], [400, 300], 'redo');
  await pg.keyboard.press('Control+z');
});
await step('Image > Image Size resizes document proportionally', async () => {
  await menu('Image', 'Image Size…');
  const w = pg.locator('.modal input[aria-label="Width"]'); await w.fill('600'); await w.press('Enter');
  await pg.getByRole('button', { name: 'OK' }).click();
  const d = await docInfo(); eq([d.w, d.h], [600, 400]);
});
await step('layers: add text, rename, hide, lock, duplicate, reorder, delete', async () => {
  await pg.getByRole('button', { name: 'Add text layer' }).click();
  let d = await docInfo(); eq(d.layers.length, 2); eq(d.layers[1].kind, 'text');
  await pg.locator('.layer-name', { hasText: 'Text' }).dblclick();
  await pg.getByLabel('Layer name').fill('Headline'); await pg.getByLabel('Layer name').press('Enter');
  d = await docInfo(); eq(d.layers[1].name, 'Headline');
  await pg.getByRole('button', { name: 'Hide layer' }).first().click(); d = await docInfo(); eq(d.layers[1].visible, false);
  await pg.getByRole('button', { name: 'Show layer' }).first().click();
  await pg.getByRole('button', { name: 'Lock layer' }).first().click(); d = await docInfo(); eq(d.layers[1].locked, true);
  await pg.getByRole('button', { name: 'Unlock layer' }).first().click();
  await pg.getByRole('button', { name: 'Duplicate layer' }).click(); d = await docInfo(); eq(d.layers.length, 3);
  await pg.getByRole('button', { name: 'Move layer down' }).click(); d = await docInfo(); eq(d.layers[1].name.includes('copy'), true, 'copy moved down');
  await pg.getByRole('button', { name: 'Delete layer' }).click(); d = await docInfo(); eq(d.layers.length, 2);
  await pg.keyboard.press('Control+z'); d = await docInfo(); eq(d.layers.length, 3, 'undo delete');
});
await step('text editing in Properties changes the layer', async () => {
  await pg.locator('.layer-name').getByText('Headline', { exact: true }).click();
  await pg.locator('textarea[aria-label="Text content"]').fill('Hello World'); await pg.locator('textarea[aria-label="Text content"]').blur();
  const t = await st(() => window.__studio.store.state.doc.layers.find(l => l.name === 'Headline').text); eq(t, 'Hello World');
});
await step('colour adjustments stored on the picture layer (non-destructive)', async () => {
  await pg.locator('.layer-name', { hasText: 'portrait' }).click();
  await pg.getByRole('tab', { name: 'Adjust' }).click();
  await pg.locator('input[aria-label="Brightness"]').fill('40'); await pg.locator('input[aria-label="Brightness"]').dispatchEvent('pointerup');
  const a = await st(() => window.__studio.store.state.doc.layers.find(l => l.kind === 'image').adjustments.brightness); eq(a, 40);
  await pg.waitForTimeout(500);
});
await step('brush paints onto picture layer and ends idle', async () => {
  await pg.getByRole('button', { name: 'Brush', exact: true }).click();
  const before = await st(() => window.__studio.store.state.doc.layers.find(l => l.kind === 'image').assetId);
  const a = await screenOf(100, 100), b = await screenOf(250, 200);
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 5 }); await pg.mouse.up(); await idle();
  const after = await st(() => window.__studio.store.state.doc.layers.find(l => l.kind === 'image').assetId); ok(before !== after, 'asset changed after stroke');
  await pg.getByRole('button', { name: 'Move', exact: true }).click();
});
await step('move tool drags a layer', async () => {
  const L = await st(() => { const l = window.__studio.store.state.doc.layers.find(l => l.name === 'Headline'); return { x: l.x, y: l.y, w: l.width, h: l.height }; });
  const a = await screenOf(L.x + 20, L.y + 5), b = await screenOf(L.x + 70, L.y + 45);
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 4 }); await pg.mouse.up();
  const L2 = await st(() => { const l = window.__studio.store.state.doc.layers.find(l => l.name === 'Headline'); return { x: l.x, y: l.y }; });
  ok(Math.abs(L2.x - L.x) > 20 || Math.abs(L2.y - L.y) > 20, 'moved ' + JSON.stringify([L, L2]));
});
await step('save project in browser and reopen after page reload (layers preserved)', async () => {
  const before = await docInfo();
  await pg.locator('.top-actions').getByRole('button', { name: 'Save', exact: true }).click(); await pg.waitForFunction(async () => (await window.__studio.repositories.projects.list()).length > 0, null, { timeout: 15000 }); console.log('saved ok, dirty=', await st(() => window.__studio.store.state.dirty));
  await pg.waitForFunction(() => !window.__studio.store.state.dirty); await pg.reload(); await pg.waitForTimeout(800);
  console.log('after reload list=', await pg.evaluate(async()=> (await window.__studio.repositories.projects.list()).length));
  await menu('File', 'My Projects…'); await pg.waitForSelector('[data-testid=project-list] li');
  await pg.getByRole('button', { name: 'Open', exact: true }).first().click(); await idle(); await pg.waitForTimeout(300);
  const after = await docInfo();
  eq(after.layers.map(l => [l.name, l.kind, l.visible, l.opacity]), before.layers.map(l => [l.name, l.kind, l.visible, l.opacity]), 'layers');
  eq([after.w, after.h], [before.w, before.h]);
  ok(await st(() => window.__studio.store.state.doc.layers.some(l => l.kind === 'text' && l.text === 'Hello World')), 'text editable');
});
await step('download .pps.json project and reopen from file', async () => {
  const dl = await download(() => menu('File', 'Download Project File (.pps.json)'), 'project.json');
  ok(/\.pps\.json$/.test(dl.suggested), 'name ' + dl.suggested);
  const j = JSON.parse(fs.readFileSync(dl.file, 'utf8')); eq(j.format, 'photo-studio-project'); eq(j.document.layers.length, 3);
  await menu('File', 'New…'); await pg.getByRole('button', { name: 'Create' }).click(); await pg.waitForTimeout(200);
  const confirm = pg.getByRole('button', { name: 'Discard changes' }); if (await confirm.isVisible().catch(() => false)) await confirm.click();
  eq((await docInfo()).layers.length, 0, 'new empty');
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'File', exact: true }).click().then(() => pg.getByRole('menuitem', { name: 'Open Project File…' }).click())]);
  await fc.setFiles(dl.file); await idle(); await pg.waitForTimeout(300);
  eq((await docInfo()).layers.length, 3, 'reopened layers');
});
await step('Export PNG / JPG / PDF with correct size and DPI (document 2x2 in @300)', async () => {
  await menu('File', 'New…'); await pg.locator('.modal select[aria-label="Preset"]').selectOption('id2'); await pg.getByRole('button', { name: 'Create' }).click(); await pg.waitForTimeout(300); { const c = pg.getByRole('button', { name: 'Discard changes' }); if (await c.isVisible().catch(() => false)) await c.click(); await pg.waitForTimeout(300); }
  const d0 = await docInfo(); eq([d0.w, d0.h, d0.dpi], [600, 600, 300]);
  await pg.getByRole('button', { name: 'Add rectangle' }).click();
  for (const fmt of ['PNG', 'JPG', 'PDF']) {
    await pg.getByRole('button', { name: 'Export', exact: true }).click();
    await pg.getByRole('button', { name: fmt, exact: true }).click();
    ok((await pg.getByTestId('export-size').innerText()).includes('600 × 600 px'), 'dialog size text');
    const dl = await download(() => pg.getByRole('button', { name: 'Export ' + fmt }).click(), 'e.' + fmt.toLowerCase());
    if (fmt === 'PDF') { const pdf = await PDFDocument.load(fs.readFileSync(dl.file)); const z = pdf.getPage(0).getSize(); eq([z.width, z.height], [144, 144], 'pdf points = 2in'); }
    else { const m = await sharp(dl.file).metadata(); eq([m.width, m.height, m.density], [600, 600, 300], fmt); }
    await idle();
  }
});
await step('Image > Canvas Size / rotate / flip canvas', async () => {
  await menu('Image', 'Rotate Canvas 90° Clockwise'); eq([(await docInfo()).w], [600]);
  await menu('Image', 'Canvas Size…'); await pg.locator('.modal input[aria-label="Width"]').fill('800'); await pg.locator('.modal input[aria-label="Width"]').press('Enter'); await pg.locator('.modal input[aria-label="Height"]').fill('500'); await pg.locator('.modal input[aria-label="Height"]').press('Enter');
  const lock = pg.locator('.modal').getByLabel('Keep proportions'); if (await lock.isChecked()) await lock.uncheck();
  await pg.locator('.modal input[aria-label="Width"]').fill('800'); await pg.locator('.modal input[aria-label="Width"]').press('Enter'); await pg.locator('.modal input[aria-label="Height"]').fill('500'); await pg.locator('.modal input[aria-label="Height"]').press('Enter');
  await pg.getByRole('button', { name: 'OK' }).click(); const d = await docInfo(); eq([d.w, d.h], [800, 500]);
});
await step('built-in templates open with correct size; save + duplicate custom template', async () => {
  await menu('File', 'New from Template…'); await pg.getByTestId('tpl-business-card').click(); await pg.waitForTimeout(300); { const c = pg.getByRole('button', { name: 'Discard changes' }); if (await c.isVisible().catch(() => false)) await c.click(); await pg.waitForTimeout(300); }
  let d = await docInfo(); eq([d.w, d.h, d.dpi], [1050, 600, 300]);
  await menu('File', 'New from Template…'); await pg.getByRole('button', { name: 'Save as template' }).click(); await pg.waitForSelector('[data-testid=template-list] li');
  await pg.locator('.modal').getByRole('button', { name: 'Duplicate', exact: true }).click(); await pg.waitForTimeout(300);
  eq(await pg.locator('[data-testid=template-list] li').count(), 2, 'dup');
  await pg.keyboard.press('Escape');
});
await pg.screenshot({ path: S + '/shot-editor.png' });

// ---------------- ID PHOTO MAKER
await pg.reload(); await pg.waitForTimeout(500);
await pg.getByRole('button', { name: /ID Photo Maker/ }).first().click(); await pg.waitForSelector('.id-maker');
const px = () => pg.getByTestId('preset-px').innerText();
await step('ID presets: 2x2 = 600x600, 1x1 = 300x300, passport 35x45mm = 413x531 @300', async () => {
  eq(await px(), '600 × 600 px');
  await pg.getByLabel('ID photo preset').selectOption('1x1in'); await pg.waitForTimeout(200); eq(await px(), '300 × 300 px');
  eq((await pg.evaluate(() => 1)), 1);
  await pg.getByLabel('ID photo preset').selectOption('passport-35x45'); await pg.waitForTimeout(200); eq(await px(), '413 × 531 px');
  await pg.getByLabel('ID photo preset').selectOption('custom-size'); await pg.getByLabel('Custom width').fill('1.5'); await pg.getByLabel('Custom width').press('Enter'); await pg.getByLabel('Custom height').fill('2'); await pg.getByLabel('Custom height').press('Enter'); await pg.waitForTimeout(200); eq(await px(), '450 × 600 px');
  await pg.getByLabel('ID photo preset').selectOption('custom-aspect'); await pg.waitForTimeout(200); eq(await px(), '450 × 600 px', 'aspect 3:4 width 1.5in');
  await pg.getByLabel('ID photo preset').selectOption('2x2in'); await pg.waitForTimeout(200); eq(await px(), '600 × 600 px');
});
await step('ID photo: upload, cover frame, plain background removal, red background', async () => {
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: /Upload portrait photo/ }).click()]);
  await fc.setFiles(S + '/portrait.jpg'); await pg.waitForTimeout(800); await idle().catch(() => {});
  await pg.waitForFunction(() => document.querySelector('.id-maker .statusbar')?.textContent.includes('1 layer'));
  await pg.locator('.id-maker').getByRole('button', { name: 'Remove plain background' }).first().click();
  await pg.waitForFunction(() => !document.querySelector('.busy-pill'), null, { timeout: 30000 }); await pg.waitForTimeout(500);
  await pg.locator('.id-left .swatch-btn', { hasText: 'Red' }).first().click(); await pg.waitForTimeout(300);
  await pg.screenshot({ path: S + '/shot-id.png' });
});
await step('ID photo export PNG: 600x600 px, 300 DPI, red background where photo was removed', async () => {
  const dl = await download(() => pg.getByRole('button', { name: 'Photo PNG' }).click(), 'id.png');
  const m = await sharp(dl.file).metadata(); eq([m.width, m.height, m.density], [600, 600, 300]);
  const { data, info } = await sharp(dl.file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px0 = [data[0], data[1], data[2]]; ok(px0[0] > 180 && px0[1] < 90 && px0[2] < 90, 'corner is red ' + px0);
});
await step('print sheet 4R, 6 copies of 2x2 in, no margins: 1200x1800 px, 300 DPI, PNG + PDF', async () => {
  await pg.locator('input[aria-label="Margin"]').fill('0'); await pg.locator('input[aria-label="Margin"]').press('Enter'); await pg.locator('input[aria-label="Gap between photos"]').fill('0'); await pg.locator('input[aria-label="Gap between photos"]').press('Enter');
  await pg.waitForTimeout(300);
  eq(await pg.getByTestId('sheet-count').innerText(), '6');
  const dl = await download(() => pg.getByRole('button', { name: 'Sheet PNG' }).click(), 'sheet.png');
  const m = await sharp(dl.file).metadata(); eq([m.width, m.height, m.density], [1200, 1800, 300]);
  const raw = await sharp(dl.file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * raw.info.width + x) * 3; return [raw.data[i], raw.data[i + 1], raw.data[i + 2]]; };
  const c = at(10, 10); ok(c[0] > 180 && c[1] < 90, 'tile 1 red ' + c); const c2 = at(1190, 1790); ok(c2[0] > 180 && c2[1] < 90, 'tile 6 red ' + c2);
  await idle().catch(() => {});
  const dp = await download(() => pg.getByRole('button', { name: 'Sheet PDF' }).click(), 'sheet.pdf');
  const pdf = await PDFDocument.load(fs.readFileSync(dp.file)); const z = pdf.getPage(0).getSize(); eq([z.width, z.height], [288, 432], 'pdf 4x6in');
});
await step('A4 sheet with margin and gap computes capacity; custom paper works', async () => {
  await pg.getByLabel('Paper size').selectOption('A4'); await pg.locator('input[aria-label="Margin"]').fill('5'); await pg.locator('input[aria-label="Margin"]').press('Enter'); await pg.locator('input[aria-label="Gap between photos"]').fill('2'); await pg.locator('input[aria-label="Gap between photos"]').press('Enter');
  await pg.locator('.id-maker').getByLabel('Fill the whole page').check(); await pg.waitForTimeout(300);
  const info = await pg.getByTestId('sheet-info').innerText(); ok(info.includes('2480 × 3508 px'), info);
  ok(parseInt(await pg.getByTestId('sheet-count').innerText()) >= 12, 'A4 fits many 2x2 photos');
  await pg.getByLabel('Paper size').selectOption('custom'); await pg.waitForTimeout(200);
  ok((await pg.getByTestId('sheet-info').innerText()).includes('1800 × 2400 px'), 'custom 6x8in');
});
await step('ID project saves editable JSON with photo layer', async () => {
  const dl = await download(() => pg.getByRole('button', { name: 'Save project' }).click(), 'id.pps.json');
  const j = JSON.parse(fs.readFileSync(dl.file, 'utf8')); eq(j.document.width, 600); eq(j.document.dpi, 300); eq(j.document.layers[0].kind, 'image'); eq(j.document.background.color, '#d62828');
});
await step('Back to editor and send ID photo to full editor', async () => {
  await pg.getByRole('button', { name: 'Open in full editor' }).click(); await pg.waitForTimeout(500);
  const d = await docInfo(); eq([d.w, d.h, d.dpi], [600, 600, 300]); ok(!(await pg.locator('.id-maker').count()), 'id closed');
});
await pg.screenshot({ path: S + '/shot-final.png' });
console.log('CONSOLE ERRORS:', JSON.stringify(errs));
console.log('SUMMARY', results.filter(r => r[0] === 'PASS').length, 'pass', results.filter(r => r[0] === 'FAIL').length, 'fail');
await browser.close();
