import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs"; // Prisma cannot run on Edge
export const dynamic = "force-dynamic"; // never prerender a DB read at build time

/**
 * The hour-2 deploy checkpoint (specs/07-deployment-runbook.md §0). Answers, in one
 * request: is the function alive, and can it reach Postgres over the pooled URL?
 * Exposes a row count and nothing else — no emails, no ids.
 */
export async function GET() {
  try {
    const users = await prisma.user.count();
    return NextResponse.json({ ok: true, db: "up", users });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", message: (e as Error).message },
      { status: 503 },
    );
  }
}
