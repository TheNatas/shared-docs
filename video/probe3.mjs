import { chromium } from 'playwright';
const U = 'https://shared-docs-thenatas-projects.vercel.app';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
await p.goto(`${U}/login`);
await p.getByRole('button', { name: /alice/i }).first().click();
await p.waitForURL('**/documents');
await p.getByText('Q3 Product Roadmap').first().waitFor({ timeout: 20000 });

// --- share dialog ---
await p.getByText('Q3 Product Roadmap').first().click();
await p.locator('.ProseMirror').waitFor();
await p.waitForTimeout(1000);
console.log('=== editor top-bar buttons ===');
console.log(await p.$$eval('header button, [class*=sticky] button, button', ns => [...new Set(ns.map(n=>`"${(n.innerText||'').trim().slice(0,30)}"|aria=${n.getAttribute('aria-label')}`))].join('\n')));
const shareBtn = p.getByRole('button', { name: /share/i }).first();
console.log('share button found:', await shareBtn.count());
if (await shareBtn.count()) {
  await shareBtn.click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: '../screenshots/probe-share.png' });
  console.log('=== dialog contents ===');
  console.log(await p.$$eval('[role=dialog] *', ns => [...new Set(ns.filter(n=>['H2','LABEL','BUTTON','INPUT','P'].includes(n.tagName)).map(n=>`${n.tagName} "${(n.innerText||n.placeholder||'').trim().slice(0,45)}"`))].join('\n')));
  await p.keyboard.press('Escape');
}
// --- import ---
await p.goto(`${U}/documents`);
await p.getByText('Q3 Product Roadmap').first().waitFor({ timeout: 20000 });
console.log('\n=== import control ===');
const imp = p.getByRole('button', { name: /import/i }).first();
console.log('import button:', await imp.count());
console.log('file inputs:', await p.locator('input[type=file]').count(), 'accept=', await p.locator('input[type=file]').first().getAttribute('accept').catch(()=>'n/a'));
console.log('limits copy on page:', (await p.locator('body').innerText()).match(/Supported files[^\n]*/)?.[0] ?? 'NOT SHOWN until dialog');
await b.close();
