import { chromium } from 'playwright';
const U='https://shared-docs-thenatas-projects.vercel.app';
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage();
await p.goto(`${U}/login`); await p.getByRole('button',{name:/alice/i}).first().click();
await p.waitForURL('**/documents'); await p.getByText('Q3 Product Roadmap').first().waitFor({timeout:30000});
await p.getByText('Q3 Product Roadmap').first().click(); await p.locator('.ProseMirror').waitFor(); await p.waitForTimeout(1000);
await p.getByRole('button',{name:/^share$/i}).first().click(); await p.waitForTimeout(1200);
console.log(await p.$$eval('[role=dialog] button, [role=dialog] [role]', ns => ns.map(n =>
  `<${n.tagName.toLowerCase()}> role=${n.getAttribute('role')||'(implicit)'} aria-label=${JSON.stringify(n.getAttribute('aria-label'))} text=${JSON.stringify(n.innerText.trim().slice(0,20))} aria-checked=${n.getAttribute('aria-checked')} data-state=${n.getAttribute('data-state')}`
).join('\n')));
await b.close();
