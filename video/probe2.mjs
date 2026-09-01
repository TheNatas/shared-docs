import { chromium } from 'playwright';
const U = 'https://shared-docs-thenatas-projects.vercel.app';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
await p.goto(`${U}/login`);
await p.getByRole('button', { name: /alice/i }).first().click();
await p.waitForURL('**/documents');
// WAIT FOR REAL CONTENT, not the skeleton
await p.getByText('Q3 Product Roadmap').first().waitFor({ timeout: 20000 });
await p.waitForTimeout(800);
await p.screenshot({ path: '../screenshots/probe-dashboard.png', fullPage: true });
console.log('=== DASHBOARD headings & buttons ===');
console.log(await p.$$eval('h1,h2,h3,button,a[href^="/documents/"]', ns => [...new Set(ns.map(n=>`${n.tagName} "${(n.innerText||'').trim().replace(/\s+/g,' ').slice(0,50)}"`))].join('\n')));

await p.getByText('Q3 Product Roadmap').first().click();
await p.waitForURL('**/documents/seed-doc-roadmap');
await p.locator('.ProseMirror').waitFor();
await p.waitForTimeout(1200);
console.log('\n=== EDITOR aria-labels (toolbar is icon-only) ===');
console.log(await p.$$eval('[aria-label]', ns => [...new Set(ns.map(n=>`${n.tagName} aria-label="${n.getAttribute('aria-label')}"`))].join('\n')));
console.log('\n=== buttons w/ title attr ===');
console.log(await p.$$eval('button[title]', ns => [...new Set(ns.map(n=>`"${n.getAttribute('title')}"`))].join(', ')));
await p.screenshot({ path: '../screenshots/probe-editor.png' });
await b.close();
