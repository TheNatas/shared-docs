import { chromium } from 'playwright';
const U='https://shared-docs-thenatas-projects.vercel.app';
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage();
await p.goto(`${U}/login`); await p.getByRole('button',{name:/alice/i}).first().click();
await p.waitForURL('**/documents'); await p.getByText('Q3 Product Roadmap').first().waitFor({timeout:30000});
// the imported doc created during recording
const link = p.getByText(/sample/i).first();
console.log('imported doc present:', await link.count());
await (await link.count() ? link : p.getByText('Q3 Product Roadmap').first()).click();
await p.locator('.ProseMirror').waitFor(); await p.waitForTimeout(1500);
console.log('exact accessible names of buttons in the top strip:');
console.log(await p.$$eval('button', ns => ns.map(n=>JSON.stringify(n.innerText||n.getAttribute('aria-label')||'')).filter(v=>v.toLowerCase().includes('share'))));
console.log('count /share/i :', await p.getByRole('button',{name:/share/i}).count());
console.log('count /^share$/i :', await p.getByRole('button',{name:/^share$/i}).count());
await b.close();
