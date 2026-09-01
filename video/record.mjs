import { chromium } from 'playwright';
import { rm, mkdir, readdir, rename } from 'node:fs/promises';
import { title, section, bullets } from './cards.mjs';

const U = process.env.APP_URL || 'https://shared-docs-thenatas-projects.vercel.app';
const OUT = '../video-out';
const W = 1600, H = 900;                      // 16:9, scaled to 1920x1080 by ffmpeg
const step = async (label, fn) => { process.stdout.write(`  ${label} ... `); try { await fn(); console.log('ok'); } catch (e) { console.log('FAILED: ' + e.message.split('\n')[0]); } };

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  deviceScaleFactor: 1,
});
const p = await ctx.newPage();
const pause = (ms) => p.waitForTimeout(ms);
const card = async (html, ms) => { await p.setContent(html); await pause(ms); };

// ── 1. title ───────────────────────────────────────────────────────────────
await step('title card', async () => card(title(), 6500));

// ── 2. sign in ─────────────────────────────────────────────────────────────
await step('login page', async () => {
  await card(section('01 — Sign in', 'Seeded accounts, one click',
    'Three demo users so the sharing flow is testable immediately.'), 5000);
  await p.goto(`${U}/login`, { waitUntil: 'domcontentloaded' });
  await pause(3500);
  await p.getByRole('button', { name: /alice/i }).first().hover(); await pause(1200);
  await p.getByRole('button', { name: /alice/i }).first().click();
  await p.waitForURL('**/documents', { timeout: 30000 });
});

// ── 3. dashboard ───────────────────────────────────────────────────────────
await step('dashboard', async () => {
  await p.getByText('Q3 Product Roadmap').first().waitFor({ timeout: 30000 });
  await pause(3000);
  await p.getByRole('heading', { name: /My documents/i }).first().hover(); await pause(2500);
  await p.mouse.wheel(0, 260); await pause(2500);
  await p.mouse.wheel(0, -260); await pause(1500);
});

// ── 4. create + format ─────────────────────────────────────────────────────
await step('create document', async () => {
  await card(section('02 — Create and edit', 'Rich text, autosaved',
    'Bold, italic, underline, headings, bulleted and numbered lists.'), 5000);
  await p.goto(`${U}/documents`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /new document/i }).first().click();
  await p.waitForURL(/\/documents\/[^/]+$/, { timeout: 30000 });
  await p.locator('.ProseMirror').waitFor({ timeout: 30000 });
  await pause(1800);
});

await step('rename', async () => {
  const t = p.locator('input[aria-label="Document title"]');
  await t.click(); await t.fill(''); await pause(400);
  await t.type('Launch Checklist', { delay: 85 });
  await pause(900); await p.locator('.ProseMirror').click(); await pause(1600);
});

const type = async (s, d = 34) => { await p.keyboard.type(s, { delay: d }); };
const tb = (label) => p.locator(`button[aria-label="${label}"]`);

await step('headings + body', async () => {
  await p.locator('.ProseMirror').click();
  await p.locator('button[aria-label="Text style"]').click(); await pause(700);
  await p.getByRole('option', { name: /heading 1/i }).first().click().catch(async () => {
    await p.getByText(/heading 1/i).first().click();
  });
  await pause(700);
  await type('Launch Checklist'); await p.keyboard.press('Enter'); await pause(600);
  await type('Everything below is '); 
  await tb('Bold').click(); await type('bold'); await tb('Bold').click();
  await type(', '); await tb('Italic').click(); await type('italic'); await tb('Italic').click();
  await type(' and '); await tb('Underline').click(); await type('underlined'); await tb('Underline').click();
  await type('.'); await p.keyboard.press('Enter'); await pause(900);
});

await step('lists', async () => {
  await tb('Bulleted list').click(); await pause(500);
  await type('Ship the editor'); await p.keyboard.press('Enter');
  await type('Ship file import'); await p.keyboard.press('Enter');
  await type('Ship role-based sharing'); await p.keyboard.press('Enter');
  await p.keyboard.press('Enter'); await pause(700);
  await tb('Numbered list').click(); await pause(500);
  await type('Record the walkthrough'); await p.keyboard.press('Enter');
  await type('Publish the submission');
  await pause(2500);
});

// ── 5. persistence ─────────────────────────────────────────────────────────
await step('reload persistence', async () => {
  await card(section('03 — Persistence', 'Formatting survives a reload',
    'Content is stored as ProseMirror JSON, not HTML.'), 5000);
  await p.goBack(); await pause(500); await p.goForward().catch(()=>{});
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.locator('.ProseMirror').waitFor({ timeout: 30000 });
  await pause(4500);
});

// ── 6. import ──────────────────────────────────────────────────────────────
await step('import', async () => {
  await card(section('04 — File import', 'A file becomes a document',
    'Supported files: .md, .txt, .docx — maximum 2 MB per file.'), 5500);
  await p.goto(`${U}/documents`, { waitUntil: 'domcontentloaded' });
  await p.getByText('Q3 Product Roadmap').first().waitFor({ timeout: 30000 });
  await pause(1200);
  await p.locator('input[type=file]').first().setInputFiles('../samples/sample.md');
  await p.waitForURL(/\/documents\/[^/]+$/, { timeout: 40000 });
  await p.locator('.ProseMirror').waitFor({ timeout: 30000 });
  await pause(2500);
  await p.mouse.wheel(0, 420); await pause(3000);
  await p.mouse.wheel(0, -420); await pause(1200);
});

// ── 7. share ───────────────────────────────────────────────────────────────
await step('share', async () => {
  await card(section('05 — Sharing', 'Owner grants access by role',
    'Viewer or Editor. Enforced on the server, not just in the UI.'), 5500);
  await p.getByRole('button', { name: /^share$/i }).first().click();
  await pause(1800);
  const dlg = p.locator('[role=dialog]');
  const email = dlg.locator('input[placeholder="Email address"]');
  await email.click(); await email.type('carol@example.com', { delay: 65 }); await pause(1500);
  // The role picker is a shadcn Select: <button role="combobox"> with an aria-label,
  // NOT a plain button. getByRole('button', {name:'Viewer'}) finds nothing.
  await dlg.locator('button[aria-label="Role for the person you are inviting"]').click();
  await pause(1100);
  await p.getByRole('option', { name: /viewer/i }).first().click();
  await pause(1200);
  await dlg.getByRole('button', { name: /^share$/i }).first().click();
  await pause(3500);
  await p.keyboard.press('Escape'); await pause(1200);
});

// ── 8. carol ───────────────────────────────────────────────────────────────
await step('carol read-only', async () => {
  await card(section('06 — The other side', 'Carol signs in',
    'Owned and shared documents are visually distinct. A Viewer cannot write.'), 5500);
  await ctx.clearCookies();
  await p.goto(`${U}/login`, { waitUntil: 'domcontentloaded' });
  await pause(1800);
  await p.getByRole('button', { name: /carol/i }).first().click();
  await p.waitForURL('**/documents', { timeout: 30000 });
  await p.getByRole('heading', { name: /Shared with me/i }).first().waitFor({ timeout: 30000 });
  await pause(4000);
  await p.getByText('sample').first().click().catch(async () => {
    await p.getByText('Team Handbook').first().click();
  });
  await p.locator('.ProseMirror').waitFor({ timeout: 30000 });
  await pause(4000);
  await p.locator('.ProseMirror').click(); await pause(600);
  await p.keyboard.type('this cannot be typed', { delay: 55 });
  await pause(3500);
});

// ── 9. closing cards ───────────────────────────────────────────────────────
await step('closing cards', async () => {
  await card(bullets('07 — Deliberately out of scope', 'What I cut, and why', [
    'Real-time collaboration — days of work. Instead: a conditional update, a 409, and a reload banner. Last write wins, but never silently.',
    'Comments, version history, tables and images — surface area, not depth.',
    'Self-service signup — the graded flow is sharing; seeded accounts make it testable in seconds.',
    'Blob storage — imports parse straight to document content, so there is nothing to configure.',
  ]), 15000);
  await card(bullets('08 — Key decisions', 'Three that shaped the build', [
    'Content is ProseMirror JSON, not HTML. The editor schema is the sanitizer — unsupported nodes are dropped on the way in.',
    'One access resolver, one pure capability function. No access is 404, never 403, so document existence never leaks.',
    'Server Components call the read layer directly. Nothing self-fetches over HTTP.',
  ]), 15000);
  await card(bullets('09 — AI workflow', 'Used heavily, verified throughout', [
    'Specs written and adversarially reviewed before any code — six of nine contradicted a sibling.',
    'Rejected: an AI version pin that broke the schema, and a confident wrong inference about a DOM dependency.',
    'Caught by testing, not by reading: mammoth silently drops underline without an explicit style map.',
    '169 automated tests. The unit suite is proven to need no env by removing it and re-running.',
  ]), 16000);
  await card(title(), 6000);
});

await p.close();
await ctx.close();
await browser.close();

const files = (await readdir(OUT)).filter(f => f.endsWith('.webm'));
if (files.length) { await rename(`${OUT}/${files[0]}`, `${OUT}/raw.webm`); console.log('\nrecorded:', `${OUT}/raw.webm`); }
else console.log('\nNO VIDEO PRODUCED');
