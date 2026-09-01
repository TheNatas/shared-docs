import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DemoAccountPanel } from "@/components/auth/DemoAccountPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { readSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in · shared-docs",
};

const DEFAULT_NEXT = "/documents";

/**
 * `?next=` is attacker-controlled, so it is an allowlist, not a sanitiser: the only values
 * this app ever produces are the pathnames middleware.ts writes for its `/documents/:path*`
 * matcher, and anything else falls back to the dashboard. That also disposes of the open
 * redirect — `//evil.com` and `https://evil.com` are simply not `/documents`.
 */
function safeNextPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return DEFAULT_NEXT;

  return value === DEFAULT_NEXT || value.startsWith(`${DEFAULT_NEXT}/`) ? value : DEFAULT_NEXT;
}

/**
 * Server shell (04-ui-spec.md §4). It holds no state and fetches nothing: `'use client'`
 * lives on the two leaves below, never on a page.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);

  // Belt and braces: middleware does not match /login, so this is the only thing standing
  // between a signed-in reviewer and a dead form. Sending them to the validated `next`
  // rather than always to the dashboard means a mid-session cookie refresh resumes on the
  // document they were opening.
  if (await readSession()) redirect(nextPath);

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="grid w-full max-w-sm gap-6">
        <div className="grid gap-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">shared-docs</h1>
          <p className="text-sm text-muted-foreground">Sign in to your documents</p>
        </div>

        <LoginForm nextPath={nextPath} />
        <DemoAccountPanel nextPath={nextPath} />
      </div>
    </div>
  );
}
