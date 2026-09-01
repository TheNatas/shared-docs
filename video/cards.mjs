export const shell = (inner, opts = {}) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('');
  *{margin:0;padding:0;box-sizing:border-box}
  body{height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
       background:${opts.bg || '#0b0b0c'};color:#fafafa;}
  .wrap{max-width:1080px;padding:0 80px;width:100%}
  h1{font-size:64px;line-height:1.05;letter-spacing:-0.03em;font-weight:700}
  h2{font-size:44px;line-height:1.15;letter-spacing:-0.02em;font-weight:650;margin-bottom:28px}
  p.sub{font-size:26px;line-height:1.5;color:#a1a1aa;margin-top:20px;font-weight:400}
  ul{list-style:none;margin-top:8px}
  li{font-size:25px;line-height:1.75;color:#d4d4d8;padding-left:34px;position:relative}
  li:before{content:"";position:absolute;left:0;top:15px;width:14px;height:2px;background:#52525b}
  .tag{display:inline-block;font-size:15px;letter-spacing:.16em;text-transform:uppercase;
       color:#71717a;margin-bottom:22px;font-weight:600}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;color:#e4e4e7;
       background:#27272a;padding:2px 8px;border-radius:5px}
  .url{font-size:22px;color:#a1a1aa;margin-top:44px;font-family:ui-monospace,Menlo,monospace}
</style></head><body><div class="wrap">${inner}</div></body></html>`;

export const title = () => shell(`
  <h1>shared&#8209;docs</h1>
  <p class="sub">Create, import and share rich-text documents.<br>A scoped full-stack product slice.</p>
  <p class="url">shared-docs-thenatas-projects.vercel.app</p>`);

export const section = (tag, heading, sub) => shell(`
  <div class="tag">${tag}</div><h2>${heading}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`);

export const bullets = (tag, heading, items) => shell(`
  <div class="tag">${tag}</div><h2>${heading}</h2><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`);
