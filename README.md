# Professional Photo Studio: Photo Editor and ID Photo Maker

An original, browser-based photo editor with a dedicated **ID Photo Maker**. It runs fully on your computer (no uploads, no paid services). It is **not** Adobe Photoshop, is not affiliated with Adobe, and does not read or write PSD files.

## Features
**Editor**
- Dark UI: tools (Move, Selection, Crop, Brush, Eraser, Text, Shape, Upload, Background removal, Colour picker), menus (File, Edit, Image, Layer, Select, View, Help), Undo/Redo, Zoom, Save, Export
- Canvas with zoom/pan, rulers (px, in, mm, cm), draggable guides, snapping, drag-and-drop and Ctrl+V paste of pictures
- Layers: add, delete, rename, duplicate, show/hide, lock, reorder (buttons or drag), opacity, select objects on canvas
- Picture tools: crop, resize (image and canvas), rotate/flip, position and size fields, brush, eraser
- Colour adjustments (non-destructive, stored per layer): brightness, contrast, saturation, exposure, temperature, tint, hue, sharpness, blur, grayscale
- Text (font, size, colour, bold, italic, alignment), shapes (rectangle, ellipse, line), transparency, border, shadow
- Templates: ID card, business card, certificate, poster, invitation, social post, profile picture, product ad, basic logo; create, save, duplicate, edit and delete your own
- Editable projects: saved in the browser (IndexedDB) or downloaded as `.pps.json`; reopening keeps every layer, position, opacity, text, shape and adjustment (nothing is flattened)
- Export PNG (keeps transparency), JPG (quality setting), PDF (page = physical print size); DPI is written into PNG/JPG files

**ID Photo Maker** (top bar button, or File > ID Photo Maker)
- Presets: 2×2 in, 1×1 in, passport 35×45 mm and more, custom size, custom aspect ratio, saved custom presets; the physical size and the pixel size are always displayed
- Upload, drag, zoom, tilt, mirror, resize with handles, face-positioning guides (never exported)
- Backgrounds: white, blue, red, custom colour; remove the old background (plain-background remover, click-to-erase, optional AI), restore original
- Print sheet: 4R, 5R, 3R, A4, Letter and custom paper, margins, gap, number of copies or fill the page, auto-rotate, cutting guide lines, live preview
- Export the single photo or the sheet as PNG, JPG or PDF at 300 DPI (150/600 selectable)
- Open the ID photo in the full editor, or save/open it as an editable project

> ID photo sizes are common defaults, not official rules. Requirements differ between agencies (including Philippine ones). Confirm the size and head position with the office that will accept the photo, and save your own preset if needed.

## Technology
React 19, TypeScript, Vite, HTML5 Canvas with a custom canvas editing engine (instead of Fabric.js: it keeps the exported result identical to the screen and keeps the project format simple), Web Worker for colour adjustments, IndexedDB + localStorage, pdf-lib and sharp (dev/test only).

## Install and run (VS Code)
Requires Node.js 20 or newer.
```
npm install
npm run dev        # open the printed address, usually http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run typecheck
npm test           # automated tests
```
In VS Code: open the folder, open a terminal (Ctrl+`), run the commands above.

## Using the ID Photo Maker
1. Click **ID Photo Maker**, choose a size (check the "Physical size / Pixels" line).
2. **Upload portrait photo**, drag it into place; use the Zoom/Tilt sliders and the guides (eyes near the yellow line, chin near the bottom of the oval).
3. Pick a background colour. If the photo has its own background, use **Remove plain background**, the **magic eraser** (click on the background) or the **AI** remover, then choose white/blue/red.
4. Choose paper, margins, gap and copies in **Print sheet**; check the preview and the "photos placed" count.
5. Export **Sheet PDF/JPG/PNG** and print at **100% / Actual size** (never "Fit to page") so the photos keep their physical size.

## Export and print
Exports are final pictures. The pixel size is `inches × DPI` (2×2 in at 300 DPI = 600×600 px). Keep your editable work with **File > Save** or **Download Project File**.

## Optional AI background removal
The built-in plain-background remover and magic eraser need no setup. For automatic cut-outs on busy backgrounds:
```
npm install @imgly/background-removal
```
Restart `npm run dev`. The first use downloads the model (internet needed once). If it is not installed the app says so; it never pretends to remove the background.

## Tests (what is verified)
- `npm test`: 62 unit tests: ID sizes (2×2 = 600×600, 1×1 = 300×300, passport preset, custom), pixel math at 300 DPI, print layout, export DPI metadata for PNG/JPG/PDF, project save and reopen, layer preservation, image processing.
- Browser tests (`dev-tools/`, Chromium via Playwright, bundled with esbuild): upload, crop, resize, layers, text, adjustments, brush, eraser, magic eraser, selection, guides, drag-reorder, save/reopen after reload, `.pps.json` download/reopen, PNG/JPG/PDF export size and DPI, templates, ID presets, ID export, 4R/A4 sheets. 28 steps passed in the last run. Edit the hard-coded paths in the scripts before reuse.
- Not run in the development sandbox (no network): `npm install`, `npm run dev`, `npm run build` with Vite, and the real AI model. Type-checking there used a loose React type shim, so run `npm run typecheck` once after installing.

## Troubleshooting
- *Blank page / errors after install*: use Node 20+, delete `node_modules`, run `npm install` again.
- *AI removal says not installed*: run the install command above and restart the dev server.
- *"Too large" on export*: browsers limit canvas size (about 16000 px per side); lower the DPI.
- *Projects disappeared*: browser storage was cleared or you use a private window; use **Download Project File** for safe copies.
- *Printed size is wrong*: print at 100% / Actual size and the same DPI you exported.

## Project layout
`src/editor` engine, `src/tools` pointer tools, `src/components` UI, `src/id-photo` ID module, `src/export` encoders, `src/project` formats and storage, `src/templates`, `src/image-processing`, `src/services` (Studio actions), `tests/`, `dev-tools/`.
