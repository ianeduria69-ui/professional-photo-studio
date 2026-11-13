# DEVELOPMENT CHECKPOINT: Professional Photo Studio / ID Photo Maker

Snapshot taken 2026-11-13, before any further development. Nothing was rebuilt or deleted for this backup.

## Completed features (code written)
**Core engine (src/editor, src/utils, src/project, src/export, src/id-photo, src/templates, src/image-processing)**
- Document model, layers (image/text/shape), history (undo/redo), snapping, raster brush/eraser, text measuring, image cache (+ adjustments Web Worker)
- Colour adjustments: brightness, contrast, saturation, exposure, temperature, tint, hue, sharpness, blur, grayscale
- Project format `.pps.json` (versioned, validated), IndexedDB repositories (projects, templates), preferences in localStorage
- Exporters: PNG (pHYs DPI), JPG (JFIF DPI), PDF (page = physical size), DPI/pixel math, canvas size limits
- ID presets (2x2 in, 1x1 in, passport 35x45 mm, others, custom size, custom aspect), print sheet layout (4R, 5R, A4, custom), face guide geometry
- Background removal: plain-background flood fill, magic eraser, optional AI (`@imgly/background-removal`, clear error if missing)
- 9 built-in template categories

**UI (React + TypeScript) written in this session**
- App.tsx, main.tsx, styles/app.css (dark theme)
- TopBar with File/Edit/Image/Layer/Select/View/Help menus, Undo/Redo/Zoom/Save/Export
- ToolBar (Move, Selection, Crop, Brush, Eraser, Text, Shape, Upload, Background removal, Colour picker, fg/bg colours), OptionsBar
- Workspace canvas: zoom/pan, rulers (px/in/mm/cm), draggable guides, snapping, drag-and-drop, clipboard paste, transform handles + rotate
- Right panels: Layers (rename, hide, lock, duplicate, reorder by buttons and drag), Properties (position/size, text, shape, shadow, border, document), Adjust, Image
- StatusBar, Toasts, dialogs: New, Export, Image/Canvas Size, My Projects, Templates (use/edit/duplicate/delete/save), Help
- ID Photo Maker (src/id-photo/IdPhotoMaker.tsx): upload, presets, saved custom presets, dpi, face guides, background colours, plain bg removal, adjustments, print sheet preview/settings, export photo/sheet as PNG/JPG/PDF, save/open project, send to full editor

## Verified working (actually run)
- `npm test` (node:test): **62 tests pass** at the last full run (ID sizes 600x600 / 300x300 at 300 DPI, passport preset, print layout, export DPI metadata, project save/reopen, layer preservation, image processing)
- TypeScript check of src + tests: clean, using a local React type shim (see Known bugs)
- Bundled with esbuild and run in real Chromium (Playwright). PASSED in the browser: page loads with no console errors; upload; crop + undo/redo; Image Size; layers (add/rename/hide/lock/duplicate/reorder/delete/undo); text edit; adjustments; brush; move; save to IndexedDB and reopen after reload (layers/text kept); download `.pps.json` and reopen; export PNG/JPG/PDF of a 2x2 in document (600x600 px, 300 DPI, PDF 144x144 pt); ID presets (600x600, 300x300, 413x531, custom 450x600); ID photo upload + plain background removal + red background; ID photo PNG export (600x600, 300 DPI, red corner); 4R sheet of 6 photos (1200x1800, 300 DPI; PDF 288x432 pt); A4/custom paper capacity; ID project JSON save; send to editor.

## Remaining unfinished tasks
1. Finish the browser test run: last run had 3 failing steps caused by test-script selectors, not confirmed app bugs: "Canvas Size/rotate/flip", "built-in templates + save/duplicate template", and part of the A4 step (`getByLabel('Margin')` and `getByLabel('Keep proportions')` match two elements; scope selectors to `.modal` / use `input[aria-label=...]`).
2. **README.md is not written yet.**
3. `npm install`, `npm run dev`, `npm run build` (Vite) have NOT been run: this sandbox has no network and no vite / @vitejs/plugin-react / @types/react. Must be run on a machine with network.
4. Not yet tested in the browser: AI background removal (needs the optional package), eraser/magic eraser clicks, selection tool actions, guides dragging, drag-reorder of layers, 600 DPI ID, saved presets.
5. Add automated tests for new UI-level logic if desired (Studio class) and copy e2e script into an `e2e/` npm script with relative paths.

## Known bugs / caveats
- Type-check used a loose local shim for React (`dev-tools/react-shim.d.ts`), so real `@types/react` may report a few extra type errors on first `npm run typecheck`; fix them then.
- Right after Save, `dirty` stays true for a moment (markSaved happens after the DB write), so a reload immediately after clicking Save can trigger the "unsaved changes" prompt.
- While brushing, colour adjustments of that layer are not shown until the stroke ends.
- Large photos are limited to 4096 px on the long side at import; each brush stroke stores a new PNG in history (memory heavy on big images).
- `dev-tools/*.mjs` scripts have hard-coded sandbox paths; edit the paths before reuse.

## Last completed development step
Fixed an accessibility bug in `components/ui.tsx` (`Row` wrapped controls in a `<label>`, which gave buttons wrong names), rebuilt, re-ran the browser test script.

## Exact next development step
Fix the three test-script selectors listed above in `dev-tools/e2e.mjs`, re-run, and fix any real app bug it reveals; then write README.md; then run `npm install && npm run typecheck && npm run build` on a networked machine.

## How to run and test
```
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm test             # 62 unit tests, no browser needed
npm run build && npm run preview
```
Optional AI background removal: `npm install @imgly/background-removal`.

Browser e2e in this sandbox (needs playwright, sharp, pdf-lib, esbuild installed; edit paths in the scripts first):
```
node dev-tools/mkimg.mjs     # makes a test portrait
node dev-tools/build.mjs     # esbuild bundle into a dist folder
node dev-tools/server.mjs &  # serves it on :5199
node dev-tools/e2e.mjs       # runs the Chromium steps
```
In the app: ID Photo Maker button (top bar) or File > ID Photo Maker.

## Final status update
- README.md written (install, run, build, preview, VS Code, ID Photo Maker, export/print, optional AI model, troubleshooting).
- `npm test`: 62/62 pass. Browser e2e (Chromium): e2e.mjs 20/20, e2e2.mjs 8/8, zero console errors.
- AI background remover without the package shows an honest "not installed" dialog (verified).
- NOT verified (no network in sandbox): `npm install`, Vite `npm run dev` / `npm run build`, real AI model run, typecheck with real @types/react.
- Known quirk: `dirty` flag clears slightly after Save finishes (after the DB write).
- Initial backup /home/claude/IDPhotoMaker_Initial_Backup.zip left untouched.

## Completed-project backup
- IDPhotoMaker_Completed_Project_Backup.zip created from this folder (node_modules excluded: it was a sandbox symlink; run `npm install`). Earlier IDPhotoMaker_Initial_Backup.zip untouched.
