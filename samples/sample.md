# Heading one

Intro paragraph with **bold text**, *italic text* and a raw <u>underlined run</u>
all in the same sentence.

## Heading two

A second paragraph, so the importer has to emit more than one block.

### Heading three

- first bullet
- second bullet
  - nested bullet
  - another nested bullet
- third bullet

1. first ordered
2. second ordered
3. third ordered

Everything below this line is DELIBERATELY UNSUPPORTED. It pins the drop
behaviour: TipTap's schema filtering must discard it rather than error, because
`codeBlock` and `link` are disabled in lib/editor-extensions.ts.

```js
const dropped = "this fenced code block must not survive import";
```

A paragraph containing [a link](https://example.com) whose mark must be dropped
while the link *text* survives as plain text.
