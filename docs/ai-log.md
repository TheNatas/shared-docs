# AI build log

Append-only, written **during** the build, not reconstructed afterwards. This is the raw
material `AI-WORKFLOW.md` is distilled from — the brief asks specifically what AI output was
**changed or rejected**, and that section is the one that cannot be written from memory at
hour 7 (specs/08-docs-plan.md §5).

Owned by the lead. A delegated agent never writes here: it returns its entry as text and the
lead pastes it in. Concurrent appends to one log are the cheapest possible way to lose evidence.

Entry format:

```
### <clock> — <task id> — <what was being done>
**Tool/model:**
**Generated:**
**Accepted / changed / rejected:**
**How it was verified:**
```

---

### 0:00 — planning — the spec set

**Tool/model:** Claude Opus 5 in Claude Code, 13 parallel subagents over two workflow runs.

**Generated:** ~11,800 lines across 13 spec documents from the assessment brief plus a
hand-written foundation document pinning the stack, schema, access model and API surface.

**Accepted / changed / rejected:** Accepted the bulk of the drafting. Two adversarial critics
were run against the output and both earned their keep — the consistency critic found **six of
nine specs contradicting a sibling** on error codes, capability names, the Zod major version,
module paths and env var names, all of which would have become real bugs when parallel agents
built from disagreeing documents. Rejected the coverage critic's proposal to cut the
import-limits copy test (it was failing because the README section was missing, not because the
test was wrong) and its proposal to drop the integration suite entirely.

**How it was verified:** Registry-checked every pinned version with `npm view` before writing
any code, which caught three traps the model had no way to know about — `prisma@latest`
resolving to an 8.0.0-rc CLI against a stable 7.x client; StarterKit v3 already bundling
Underline, so registering it again throws at editor init; and `@tiptap/html` v3 shipping zero
dependencies, confirming it has no DOM on a serverless route. The last one converted risk R1
from an unknown into a known problem with a plan.

### 0:25 — T01 — pinned dependency install

**Tool/model:** Claude Opus 5 (Claude Code), working from `specs/_toolchain-findings.md`.

**Generated:** A `package.json` pinning `prisma` and `@prisma/client` to **7.10.0**, derived
from an `npm view` check that flagged `prisma@latest` resolving to an `8.0.0-rc` CLI against a
stable 7.x client.

**Accepted / changed / rejected:** **Rejected, on evidence.** The install's `postinstall` failed
immediately — Prisma 7 removed `url` and `directUrl` from the schema `datasource` block, moving
connection config to `prisma.config.ts` and requiring a driver adapter. That is a breaking
redesign, not a version bump, and adopting it would have meant rewriting the datasource block,
`lib/db.ts` and the pooled/direct URL story in the deployment runbook — 30–45 minutes of
unplanned work whose failure mode lands on the hour-2 deploy gate. Reverted both halves to
**6.19.3**. Notably, the *original* spec draft had said "stay on the Prisma 6.x line for the
whole assessment"; the AI-generated toolchain pin overrode it, and the original was right.

**How it was verified:** `pnpm install` green, `prisma migrate dev --name init` produced exactly
one migration containing all four expected index statements, and `/api/health` returned
`{"ok":true,"db":"up","users":0}` against the real database.

### 0:40 — T03 — the R1 import spike

**Tool/model:** Claude Opus 5 (Claude Code), 30-minute hard time-box.

**Generated:** A spike script plus the claim (TRAP-3) that `@tiptap/html` v3 needs a
caller-supplied DOM on Node, inferred from the package having zero dependencies where v2 had
bundled `zeed-dom`. On that basis the spike was directed to start on Plan B (jsdom).

**Accepted / changed / rejected:** **The inference was wrong.** The package ships a `node`
conditional export resolving to a server build; it has no DOM dependency because it does not
need one. Plan A passed in ~6 minutes of the 30-minute box with zero extra packages, `jsdom` was
removed, and `.docx` import — which had been cut-list item 7, contingent on this outcome — is no
longer at risk. Two of the three traps in the findings file turned out to have a correct
observation and a wrong conclusion.

**How it was verified:** The spike asserts on the real output, not on the absence of an error:
`doc` root, `heading` level 1, `bold`/`italic`/`underline` marks, `bulletList`, `orderedList`.
TRAP-2 was verified the same way — by printing StarterKit's own extension list and finding
`underline` in it — rather than by trusting the registry metadata.
