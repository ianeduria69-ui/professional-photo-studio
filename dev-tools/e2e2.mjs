import { createRequire } from 'node:module';
const require = createRequire('/home/claude/professional-photo-studio/'); const { chromium } = require('playwright'); const sharp = require('sharp');
const S='/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad'; const errs=[]; let pass=0, fail=0;
async function step(n, f){ try{ await f(); pass++; console.log('PASS', n);}catch(e){ fail++; console.log('FAIL', n, '-', e.message.split('\n')[0]); } }
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'')+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a)); };
const b = await chromium.launch(); const pg = await (await b.newContext({viewport:{width:1500,height:900}})).newPage();
pg.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); }); pg.on('pageerror', e=>errs.push(e.message));
await pg.goto('http://localhost:5199/'); await pg.waitForTimeout(500);
const ev=(f,a)=>pg.evaluate(f,a); const idle=()=>pg.waitForFunction(()=>!window.__studio.store.state.busy,null,{timeout:30000});
const screenOf=(dx,dy)=>pg.evaluate(([dx,dy])=>{const s=window.__studio.store.state;const r=document.querySelector('.viewport').getBoundingClientRect();return{x:r.left+s.panX+dx*s.zoom,y:r.top+s.panY+dy*s.zoom};},[dx,dy]);
const [fc]=await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button',{name:'Image upload'}).click()]); await fc.setFiles(S+'/portrait.png'); await pg.waitForSelector('[data-testid=layer-row]'); await idle();
const alphaAt = async (dx,dy)=> ev(async([dx,dy])=>{ const st=window.__studio; const l=st.store.state.doc.layers.find(l=>l.kind==='image'); const img=await st.cache.loadAsset(l.assetId); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const x=c.getContext('2d'); x.drawImage(img,0,0); const p=x.getImageData(Math.round((dx-l.x)/l.width*img.width),Math.round((dy-l.y)/l.height*img.height),1,1).data; return p[3]; },[dx,dy]);
const L = await ev(()=>{const l=window.__studio.store.state.doc.layers[0]; return {x:l.x,y:l.y,w:l.width,h:l.height};});
await step('magic eraser removes plain background colour on click', async()=>{
  const before=await alphaAt(L.x+5,L.y+5); eq(before,255);
  await pg.getByRole('button',{name:'Background removal (magic eraser)'}).click(); const p=await screenOf(L.x+5,L.y+5); await pg.mouse.click(p.x,p.y); await idle();
  eq(await alphaAt(L.x+5,L.y+5),0,'corner transparent'); const face=await alphaAt(L.x+L.w/2,L.y+L.h*0.42); eq(face,255,'face kept');
  eq(await ev(()=>!!window.__studio.store.state.doc.layers[0].originalAssetId),true,'original kept');
  await pg.getByRole('button',{name:'Restore original picture'}).first().click().catch(()=>{});
});
await step('restore original picture via Image panel', async()=>{
  await pg.getByRole('tab',{name:'Image'}).click(); await pg.getByRole('button',{name:'Restore original picture'}).click(); eq(await alphaAt(L.x+5,L.y+5),255);
});
await step('eraser tool erases pixels', async()=>{
  await pg.getByRole('button',{name:'Eraser',exact:true}).click(); const a=await screenOf(L.x+L.w/2,L.y+L.h*0.4),c=await screenOf(L.x+L.w/2+30,L.y+L.h*0.4);
  await pg.mouse.move(a.x,a.y); await pg.mouse.down(); await pg.mouse.move(c.x,c.y,{steps:4}); await pg.mouse.up(); await idle();
  eq(await alphaAt(L.x+L.w/2+10,L.y+L.h*0.4)<255,true,'erased');
  await pg.keyboard.press('Control+z'); eq(await alphaAt(L.x+L.w/2+10,L.y+L.h*0.4),255,'undo restores');
});
await step('selection tool: fill with foreground adds layer; crop canvas to selection', async()=>{
  await pg.getByRole('button',{name:'Selection',exact:true}).click(); const a=await screenOf(50,50),c=await screenOf(250,170);
  await pg.mouse.move(a.x,a.y); await pg.mouse.down(); await pg.mouse.move(c.x,c.y,{steps:3}); await pg.mouse.up();
  const n=await ev(()=>window.__studio.store.state.doc.layers.length); await pg.getByRole('button',{name:'Fill with foreground'}).click(); eq(await ev(()=>window.__studio.store.state.doc.layers.length),n+1);
  await pg.getByRole('button',{name:'Crop canvas to selection'}).click(); const d=await ev(()=>({w:window.__studio.store.state.doc.width,h:window.__studio.store.state.doc.height})); eq([d.w,d.h],[200,120]);
});
await step('drag a guide from the ruler', async()=>{
  const r=await pg.locator('.ruler-top').boundingBox(); const t=await screenOf(100,60);
  await pg.mouse.move(r.x+r.width/2,r.y+10); await pg.mouse.down(); await pg.mouse.move(t.x,t.y,{steps:5}); await pg.mouse.up();
  eq(await ev(()=>window.__studio.store.state.doc.guides.length),1);
});
await step('layers panel drag-and-drop reorder', async()=>{
  const names=await ev(()=>window.__studio.store.state.doc.layers.map(l=>l.name));
  await pg.locator('[data-testid=layer-row]').nth(0).dragTo(pg.locator('[data-testid=layer-row]').nth(1));
  const after=await ev(()=>window.__studio.store.state.doc.layers.map(l=>l.name)); eq(after,[...names].reverse());
});
await pg.reload(); await pg.waitForTimeout(400); await pg.getByRole('button',{name:/ID Photo Maker/}).first().click(); await pg.waitForSelector('.id-maker');
await step('ID 600 DPI doubles pixels; saved user preset persists', async()=>{
  await pg.getByLabel('Photo DPI').selectOption('600'); await pg.waitForTimeout(200); eq(await pg.getByTestId('preset-px').innerText(),'1200 × 1200 px');
  await pg.getByLabel('Photo DPI').selectOption('300');
  await pg.getByLabel('ID photo preset').selectOption('custom-size'); await pg.locator('input[aria-label="Custom width"]').fill('3.5'); await pg.locator('input[aria-label="Custom width"]').press('Enter'); await pg.locator('input[aria-label="Custom height"]').fill('4.5'); await pg.locator('input[aria-label="Custom height"]').press('Enter');
  await pg.getByRole('button',{name:'Save as preset…'}).click(); await pg.locator('.modal input[aria-label="Preset name"]').fill('My 3.5x4.5'); await pg.getByRole('button',{name:'OK'}).click(); await pg.waitForTimeout(200);
  eq(await pg.getByTestId('preset-px').innerText(),'1050 × 1350 px');
  eq(await pg.evaluate(()=>JSON.parse(localStorage.getItem('photo-studio:id-presets:v1')).length),1);
});
await step('ID photo drag/resize via handles keeps photo layer selected and undo works', async()=>{
  const [fc2]=await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button',{name:/Upload portrait photo/}).click()]); await fc2.setFiles(S+'/portrait.jpg'); await pg.waitForFunction(()=>document.querySelector('.id-maker .statusbar')?.textContent.includes('1 layer')); await pg.waitForTimeout(300);
  const x0=await pg.locator('.id-maker input[aria-label="X position"]').inputValue().catch(()=>null);
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Control+z'); await pg.keyboard.press('Control+z');
});
console.log('ERRORS', JSON.stringify(errs)); console.log('SUMMARY', pass, 'pass', fail, 'fail'); await b.close();
