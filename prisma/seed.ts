import { PrismaClient, ShareRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  documentContentSchema,
  toPrismaJson,
  type DocumentContent,
} from "../lib/documents/content";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "demo1234";

// Every seeded body exercises every supported node and mark — H1, H2, paragraph, bold,
// italic, underline, bulletList, orderedList — so the formatting requirements are visible
// the instant a document opens, before anyone types a character. `underline` is the mark
// name StarterKit v3 registers; it must match lib/editor-extensions.ts or seeded documents
// render without it.
const text = (t: string, marks?: string[]) => ({
  type: "text",
  text: t,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

const bullets = (items: string[]) => ({
  type: "bulletList",
  content: items.map((i) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [text(i)] }],
  })),
});

const numbered = (items: string[]) => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((i) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [text(i)] }],
  })),
});

function demoDoc(
  heading: string,
  lead: string,
  points: string[],
  steps: string[],
): DocumentContent {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [text(heading)] },
      {
        type: "paragraph",
        content: [
          text("This document is "),
          text("seeded demo content", ["bold"]),
          text(" — it is "),
          text("safe to edit", ["italic"]),
          text(" and can be restored with "),
          text("pnpm prisma db seed", ["underline"]),
          text("."),
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [text("Summary")] },
      { type: "paragraph", content: [text(lead)] },
      bullets(points),
      { type: "heading", attrs: { level: 2 }, content: [text("Next steps")] },
      numbered(steps),
    ],
  };
}

// Fixed, human-readable ids rather than generated cuids: stable URLs for the demo and the
// video script, stable fixtures for the integration suite, and a seed that is idempotent by
// id as well as by email. `@default(cuid())` only fires when the field is omitted, so
// supplying a string is legal. The cost every other slice must respect: ids are validated as
// z.string().min(1).max(64), never z.string().cuid().
const USERS = [
  { id: "seed-user-alice", email: "alice@example.com", name: "Alice Rivera" },
  { id: "seed-user-bob", email: "bob@example.com", name: "Bob Chen" },
  { id: "seed-user-carol", email: "carol@example.com", name: "Carol Mendes" },
] as const;

const DOCS: Array<{
  id: string;
  title: string;
  ownerId: string;
  sourceFilename?: string;
  content: DocumentContent;
  shares: Array<{ userId: string; role: ShareRole }>;
}> = [
  {
    id: "seed-doc-roadmap",
    title: "Q3 Product Roadmap",
    ownerId: "seed-user-alice",
    content: demoDoc(
      "Q3 Product Roadmap",
      "What we are shipping this quarter.",
      ["Document editing", "File import", "Sharing with roles"],
      ["Lock scope", "Ship the editor", "Ship sharing"],
    ),
    shares: [{ userId: "seed-user-bob", role: ShareRole.EDITOR }],
  },
  {
    id: "seed-doc-handbook",
    title: "Team Handbook",
    ownerId: "seed-user-alice",
    content: demoDoc(
      "Team Handbook",
      "How the team works day to day.",
      ["Async by default", "Write decisions down", "Small pull requests"],
      ["Read this", "Ask questions", "Suggest an edit"],
    ),
    shares: [{ userId: "seed-user-carol", role: ShareRole.VIEWER }],
  },
  {
    id: "seed-doc-private",
    title: "Alice — Private Draft",
    ownerId: "seed-user-alice",
    content: demoDoc(
      "Private Draft",
      "Nobody else can open this document.",
      ["Not shared with Bob", "Not shared with Carol"],
      ["Try opening it as Bob", "Expect a 404, not a 403"],
    ),
    shares: [],
  },
  {
    id: "seed-doc-bob-notes",
    title: "Bob's Meeting Notes",
    ownerId: "seed-user-bob",
    content: demoDoc(
      "Meeting Notes",
      "Bob owns this; Alice cannot see it.",
      ["Owned by Bob", "Shared with nobody"],
      ["Sign in as Bob", "Confirm it is under My documents"],
    ),
    shares: [],
  },
  {
    id: "seed-doc-imported",
    title: "Imported: Product Brief",
    ownerId: "seed-user-alice",
    sourceFilename: "product-brief.md",
    content: demoDoc(
      "Product Brief",
      "Created by importing a Markdown file.",
      [
        "Imported from product-brief.md",
        "Shared with two people at two roles",
      ],
      ["Open the share dialog", "Change Bob to Editor", "Revoke Carol"],
    ),
    shares: [
      { userId: "seed-user-bob", role: ShareRole.VIEWER },
      { userId: "seed-user-carol", role: ShareRole.EDITOR },
    ],
  },
];

async function main() {
  // Once, outside the loop: ~100 ms at cost 10, and an identical hash across the three
  // accounts keeps the fixture easy to reason about.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { id: u.id, name: u.name, passwordHash },
      create: { ...u, passwordHash },
    });
  }

  for (const d of DOCS) {
    // Parsed, not cast: a malformed body must fail here rather than reach the column and
    // make the editor unopenable — the same rule the import route follows (01 §5.1).
    const content = toPrismaJson(documentContentSchema.parse(d.content));

    await prisma.document.upsert({
      where: { id: d.id },
      // The update branch restores the canonical demo state. That is the feature, not a
      // side effect: reviewers edit the seeded documents, so re-seeding is "reset the demo".
      update: {
        title: d.title,
        content,
        sourceFilename: d.sourceFilename ?? null,
        ownerId: d.ownerId,
      },
      create: {
        id: d.id,
        title: d.title,
        content,
        sourceFilename: d.sourceFilename ?? null,
        ownerId: d.ownerId,
      },
    });

    for (const s of d.shares) {
      await prisma.documentShare.upsert({
        where: { documentId_userId: { documentId: d.id, userId: s.userId } },
        update: { role: s.role, grantedById: d.ownerId },
        create: {
          documentId: d.id,
          userId: s.userId,
          role: s.role,
          grantedById: d.ownerId,
        },
      });
    }
  }

  // Printed as markdown so README.md's demo-accounts table is PASTED from a real run,
  // never hand-typed (08-docs-plan.md §2.9). A typed table drifts the first time an
  // email changes, and a reviewer who cannot log in stops reviewing.
  console.log(`\nSeeded ${USERS.length} users and ${DOCS.length} documents.\n`);
  console.log("| Name | Email | Password | Set up so that… |");
  console.log("|---|---|---|---|");
  console.log(
    `| Alice | \`alice@example.com\` | \`${DEMO_PASSWORD}\` | owns four documents and has shared three of them |`,
  );
  console.log(
    `| Bob | \`bob@example.com\` | \`${DEMO_PASSWORD}\` | **editor** on "Q3 Product Roadmap", **viewer** on "Imported: Product Brief", owns one document of his own |`,
  );
  console.log(
    `| Carol | \`carol@example.com\` | \`${DEMO_PASSWORD}\` | **viewer** on "Team Handbook", **editor** on "Imported: Product Brief", and has **no access** to "Alice — Private Draft" so the denial path is demonstrable |`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
