import { chromium } from 'playwright';
const U = 'https://shared-docs-thenatas-projects.vercel.app';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

const dump = async (label) => {
  const els = await p.$$eval('button, a[href], input, [role="button"], [data-testid]', ns =>
    ns.slice(0, 40).map(n => {
      const t = (n.innerText || n.value || n.placeholder || '').trim().replace(/\s+/g,' ').slice(0,45);
      return `${n.tagName.toLowerCase()}${n.type?'['+n.type+']':''} ${n.id?'#'+n.id:''} "${t}"`;
    }));
  console.log(`\n===== ${label} =====\n` + [...new Set(els)].join('\n'));
};

await p.goto(`${U}/login`, { waitUntil: 'networkidle' });
await dump('LOGIN');
await p.screenshot({ path: '../screenshots/probe-login.png' });

// find the Alice demo button
const alice = p.getByRole('button', { name: /alice/i }).first();
await alice.click();
await p.waitForURL('**/documents**', { timeout: 20000 }).catch(()=>{});
await p.waitForLoadState('networkidle');
await dump('DASHBOARD');
await p.screenshot({ path: '../screenshots/probe-dashboard.png', fullPage: true });

// open the roadmap doc
await p.getByText('Q3 Product Roadmap').first().click();
await p.waitForLoadState('networkidle');
await p.waitForTimeout(1500);
await dump('EDITOR');
await p.screenshot({ path: '../screenshots/probe-editor.png' });
console.log('\nURL:', p.url());
console.log('\n--- editor DOM probe ---');
console.log(await p.$$eval('[class*=ProseMirror], [contenteditable]', ns => ns.map(n=>`${n.tagName} contenteditable=${n.getAttribute('contenteditable')} class="${(n.className||'').toString().slice(0,60)}"`)).catch(e=>'none'));
await b.close();
