// scripts/spike-generate-json.mjs
// R1 spike (specs/05-import-spec.md §5.2). Run: node scripts/spike-generate-json.mjs
// PASS = exits 0 and prints SPIKE PASS on stderr. FAIL = anything else.
import assert from 'node:assert/strict';
import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';

const HTML =
  '<h1>Title</h1>' +
  '<p><strong>bold</strong> <em>italic</em> <u>underline</u></p>' +
  '<ul><li>one</li><li>two</li></ul>' +
  '<ol><li>first</li></ol>';

// No Underline entry — StarterKit v3 registers it. If this array grows one, the
// editor throws `Duplicate extension name` at mount (TRAP-2).
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false, code: false, blockquote: false,
    horizontalRule: false, strike: false, link: false,
  }),
];

const json = generateJSON(HTML, extensions);
console.log(JSON.stringify(json, null, 2));

assert.equal(json.type, 'doc');
assert.equal(json.content[0].type, 'heading');
assert.equal(json.content[0].attrs.level, 1);
const flat = JSON.stringify(json);
assert.ok(flat.includes('"type":"bold"'), 'bold mark missing');
assert.ok(flat.includes('"type":"italic"'), 'italic mark missing');
assert.ok(flat.includes('"type":"underline"'), 'underline mark missing');
assert.ok(flat.includes('"type":"bulletList"'), 'bulletList missing');
assert.ok(flat.includes('"type":"orderedList"'), 'orderedList missing');
console.error('SPIKE PASS');
