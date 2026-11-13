import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { renderDocument } from '../editor/renderer';
import { useEditor, useStudio } from '../services/context';
import { drawToolOverlay } from '../tools/overlay';
import { ToolController, type PointerInfo } from '../tools/controller';
import type { DocumentModel, Unit } from '../types';
import { fromInches } from '../id-photo/presets';

const RULER = 20;
const UNIT_ORDER: Unit[] = ['px', 'in', 'mm', 'cm'];

/** Called with the context already scaled to document pixels. `onePx` is the size of one screen pixel in document units. */
export type DocOverlay = (ctx: CanvasRenderingContext2D, doc: DocumentModel, onePx: number) => void;

let checker: HTMLCanvasElement | null = null;
function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!checker) {
    checker = document.createElement('canvas');
    checker.width = 16;
    checker.height = 16;
    const c = checker.getContext('2d');
    if (c) {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#d6d9de';
      c.fillRect(0, 0, 8, 8);
      c.fillRect(8, 8, 8, 8);
    }
  }
  return ctx.createPattern(checker, 'repeat');
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function niceStep(minUnits: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(minUnits)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= minUnits) return m * pow;
  return 10 * pow;
}

function drawRuler(
  canvas: HTMLCanvasElement,
  horizontal: boolean,
  origin: number,
  zoom: number,
  docLen: number,
  unit: Unit,
  dpi: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = horizontal ? canvas.clientWidth : RULER;
  const cssH = horizontal ? RULER : canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#22252b';
  ctx.fillRect(0, 0, cssW, cssH);
  const len = horizontal ? cssW : cssH;
  // doc extent
  ctx.fillStyle = '#2d3138';
  if (horizontal) ctx.fillRect(origin, 0, docLen * zoom, RULER);
  else ctx.fillRect(0, origin, RULER, docLen * zoom);

  const pxPerUnit = (dpi / fromInches(1, unit, dpi)) * zoom;
  const step = niceStep(56 / pxPerUnit);
  const mantissa = Math.round(step / Math.pow(10, Math.floor(Math.log10(step))));
  const minor = mantissa === 1 ? step / 10 : mantissa === 2 ? step / 4 : step / 5;
  const first = Math.floor(-origin / pxPerUnit / minor) * minor;
  const last = (len - origin) / pxPerUnit;
  ctx.strokeStyle = '#6b7280';
  ctx.fillStyle = '#aab1bd';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let u = first; u <= last + minor; u += minor) {
    const pos = Math.round(origin + u * pxPerUnit) + 0.5;
    const isMajor = Math.abs(u / step - Math.round(u / step)) < 1e-6;
    const tick = isMajor ? RULER : RULER * 0.35;
    if (horizontal) {
      ctx.moveTo(pos, RULER - tick);
      ctx.lineTo(pos, RULER);
    } else {
      ctx.moveTo(RULER - tick, pos);
      ctx.lineTo(RULER, pos);
    }
  }
  ctx.stroke();
  for (let u = Math.floor(-origin / pxPerUnit / step) * step; u <= last; u += step) {
    const pos = origin + u * pxPerUnit;
    const label = String(Number(u.toFixed(3)));
    if (horizontal) ctx.fillText(label, pos + 3, 2);
    else {
      ctx.save();
      ctx.translate(2, pos - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'left';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
}

export function Workspace(props: { overlay?: DocOverlay; hint?: boolean; onFiles?: (files: File[], at: { x: number; y: number }) => void }) {
  const studio = useStudio();
  const store = studio.store;
  const controller = useMemo(() => new ToolController(studio), [studio]);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef(props.overlay);
  overlayRef.current = props.overlay;
  const [unit, setUnit] = useState<Unit>('px');
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const [dragging, setDragging] = useState(false);
  const showRulers = useEditor((s) => s.showRulers);
  const noLayers = useEditor((s) => s.doc.layers.length === 0);

  // ----------------------------------------------------------------- drawing
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = 0;
      const canvas = canvasRef.current;
      const vp = viewportRef.current;
      if (!canvas || !vp) return;
      const dpr = window.devicePixelRatio || 1;
      const w = vp.clientWidth;
      const h = vp.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const st = store.state;
      const doc = store.doc;
      studio.cache.sync(doc);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#14161a';
      ctx.fillRect(0, 0, w, h);
      const x0 = st.panX;
      const y0 = st.panY;
      const dw = doc.width * st.zoom;
      const dh = doc.height * st.zoom;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x0, y0, dw, dh);
      ctx.restore();
      if (doc.background.transparent) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, dw, dh);
        ctx.clip();
        const pat = checkerPattern(ctx);
        if (pat) {
          ctx.fillStyle = pat;
          ctx.translate(x0, y0);
          ctx.fillRect(0, 0, dw, dh);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, dw, dh);
      ctx.clip();
      ctx.translate(x0, y0);
      ctx.scale(st.zoom, st.zoom);
      renderDocument(ctx, doc, { provider: studio.cache, quality: 'preview', drawBackground: true, pixelScale: st.zoom * dpr });
      ctx.restore();

      if (overlayRef.current) {
        ctx.save();
        ctx.translate(x0, y0);
        ctx.scale(st.zoom, st.zoom);
        overlayRef.current(ctx, doc, 1 / st.zoom);
        ctx.restore();
      }

      drawToolOverlay(ctx, studio, controller, w, h);
      vp.style.cursor = controller.cursor;

      if (st.showRulers) {
        if (topRef.current) drawRuler(topRef.current, true, st.panX, st.zoom, doc.width, unitRef.current, doc.dpi);
        if (leftRef.current) drawRuler(leftRef.current, false, st.panY, st.zoom, doc.height, unitRef.current, doc.dpi);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const unsub = store.subscribe(schedule);
    const ro = new ResizeObserver(() => {
      const vp = viewportRef.current;
      if (vp && vp.clientWidth > 0) {
        const first = studio.viewport.width === 900 && studio.viewport.height === 600;
        studio.setViewport(vp.clientWidth, vp.clientHeight);
        if (first) studio.fit();
      }
      schedule();
    });
    if (viewportRef.current) ro.observe(viewportRef.current);
    schedule();
    return () => {
      unsub();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [studio, store, controller]);

  useEffect(() => {
    // redraw when the unit, the ruler visibility or the overlay changes
    store.bump();
  }, [unit, showRulers, props.overlay, store]);

  // ----------------------------------------------------------------- input
  const info = (e: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; button?: number }): PointerInfo => {
    const r = viewportRef.current?.getBoundingClientRect();
    const sx = e.clientX - (r?.left ?? 0);
    const sy = e.clientY - (r?.top ?? 0);
    const d = controller.toDoc(sx, sy);
    return { sx, sy, x: d.x, y: d.y, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, button: e.button ?? 0 };
  };

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    controller.pointerDown(info(e));
    store.bump();
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const i = info(e);
    controller.pointerMove(i);
    studio.setCursor(`${Math.round(i.x)}, ${Math.round(i.y)} px`);
    store.bump();
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    controller.pointerUp(info(e));
  };
  const onLeave = () => {
    controller.hover = null;
    studio.setCursor('');
    store.bump();
  };

  const rulerDown = (horizontal: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    controller.beginGuide(horizontal ? 'h' : 'v', info(e));
    store.bump();
  };

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        studio.zoomAt(store.state.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else {
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        store.set({ panX: store.state.panX - dx, panY: store.state.panY - dy });
      }
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [studio, store]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !(e.target as HTMLElement | null)?.closest?.('button')) {
        e.preventDefault();
        controller.spaceDown = true;
        store.bump();
      } else if (e.key === 'Escape' && controller.active) {
        controller.cancel();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        controller.spaceDown = false;
        store.bump();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [controller, store]);

  const onDoubleClick = (e: ReactMouseEvent<HTMLElement>) => {
    const i = info(e);
    if (store.state.tool !== 'move') return;
    const hit = controller.hitLayer({ x: i.x, y: i.y });
    if (hit && hit.kind === 'text') {
      store.select(hit.id);
      studio.addTextFocus();
    }
  };

  const onDrop = async (e: ReactDragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []) as File[];
    if (!files.length) return;
    const i = info(e);
    if (props.onFiles) {
      props.onFiles(files, { x: i.x, y: i.y });
      return;
    }
    let n = 0;
    for (const f of files) {
      if (/\.json$/i.test(f.name)) {
        await studio.openProjectFile(f);
        return;
      }
      await studio.addImageFile(f, { x: i.x + n * 30, y: i.y + n * 30 });
      n++;
    }
  };

  return (
    <div className={`workspace ${showRulers ? 'with-rulers' : ''}`} ref={rootRef}>
      {showRulers && (
        <>
          <button
            className="ruler-corner"
            title="Ruler units (click to change)"
            onClick={() => setUnit(UNIT_ORDER[(UNIT_ORDER.indexOf(unit) + 1) % UNIT_ORDER.length])}
          >
            {unit}
          </button>
          <canvas className="ruler ruler-top" ref={topRef} onPointerDown={rulerDown(true)} onPointerMove={onMove} onPointerUp={onUp} title="Drag down to create a horizontal guide" />
          <canvas className="ruler ruler-left" ref={leftRef} onPointerDown={rulerDown(false)} onPointerMove={onMove} onPointerUp={onUp} title="Drag right to create a vertical guide" />
        </>
      )}
      <div
        className={`viewport ${dragging ? 'dragging' : ''}`}
        ref={viewportRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => controller.cancel()}
        onPointerLeave={onLeave}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} data-testid="main-canvas" />
        {noLayers && props.hint !== false && (
          <div className="empty-hint">
            <strong>Drop a picture here</strong>
            <span>or use the Upload tool, File &gt; Open Image, or paste with Ctrl+V</span>
          </div>
        )}
        {dragging && <div className="drop-hint">Drop JPG, PNG or WebP pictures (or a .pps.json project) to add them</div>}
      </div>
    </div>
  );
}
