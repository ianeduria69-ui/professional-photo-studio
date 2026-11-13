import { createRequire } from 'node:module';
const require = createRequire('/home/claude/professional-photo-studio/'); const { chromium } = require('playwright');
const b = await chromium.launch(); const pg = await (await b.newContext({viewport:{width:1500,height:900}})).newPage();
await pg.goto('http://localhost:5199/'); await pg.waitForTimeout(400);
const [fc]=await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button',{name:'Image upload'}).click()]); await fc.setFiles('/tmp/claude-0/-home-claude/52139727-53ca-519e-8939-7b375d4f3dbb/scratchpad/portrait.png'); await pg.waitForSelector('[data-testid=layer-row]');
await pg.getByRole('tab',{name:'Image'}).click(); await pg.getByRole('button',{name:'Remove background (AI)'}).click();
await pg.waitForSelector('.modal'); console.log('ALERT:', (await pg.locator('.modal').innerText()).replace(/\n+/g,' | ').slice(0,400)); await b.close();
