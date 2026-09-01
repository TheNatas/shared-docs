import { chromium } from 'playwright';
const U='https://shared-docs-thenatas-projects.vercel.app';
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage();
await p.goto(`${U}/login`); await p.getByRole('button',{name:/alice/i}).first().click();
await p.waitForURL('**/documents'); await p.getByText('Q3 Product Roadmap').first().waitFor({timeout:30000});
await p.getByText('Q3 Product Roadmap').first().click(); await p.locator('.ProseMirror').waitFor(); await p.waitForTimeout(1500);
const n = await p.getByRole('button',{name:/share/i}).count();
console.log('Share button count:', n);
if(n){ await p.getByRole('button',{name:/share/i}).first().click(); await p.waitForTimeout(1500);
  await p.screenshot({path:'../screenshots/probe-share.png'});
  console.log('dialog:', await p.$$eval('[role=dialog] h2,[role=dialog] label,[role=dialog] button,[role=dialog] input',
    ns=>[...new Set(ns.map(x=>`${x.tagName} "${(x.innerText||x.placeholder||'').trim().slice(0,40)}"`))].join(' | ')));
}
await b.close();
