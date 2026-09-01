"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { signInErrorMessage, useSignIn } from "@/components/auth/LoginForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * One click per identity (04-ui-spec.md §4.4).
 *
 * The graded flow is *sharing*, and sharing is only legible when a reviewer can be Alice,
 * share a document, then be Bob and see it. Each button POSTs the seeded credentials
 * directly — it does NOT prefill the form, because the fastest path is one click, not
 * click-then-submit.
 *
 * Always on, in every environment, with no flag: this build has no signup and exists only as
 * a review artifact with three seeded accounts, so a `NEXT_PUBLIC_DEMO_MODE` flag would guard
 * a production that will never exist while adding an untested code path and one more thing to
 * misconfigure on Vercel. The panel says "review build" out loud instead.
 */

/** Matches the single hash every seeded user shares (prisma/seed.ts, 00-foundation.md §5). */
export const DEMO_PASSWORD = "demo1234";

/**
 * Every hint names something prisma/seed.ts actually creates — Alice owns roadmap, handbook,
 * private draft and the imported brief, and shares three of them. A login page that points a
 * reviewer at a document that does not exist is worse than no hint at all.
 */
const DEMO_ACCOUNTS = [
  { email: "alice@example.com", name: "Alice", hint: "owns four documents, shares three" },
  { email: "bob@example.com", name: "Bob", hint: 'editor on "Q3 Product Roadmap"' },
  { email: "carol@example.com", name: "Carol", hint: 'viewer on "Team Handbook"' },
] as const;

export function DemoAccountPanel({ nextPath }: { nextPath: string }) {
  const signIn = useSignIn(nextPath);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signInAs(email: string) {
    setError(null);
    setPendingEmail(email);

    try {
      await signIn({ email, password: DEMO_PASSWORD });
      // Pending stays set: the redirect is in flight (see LoginForm).
    } catch (err) {
      // A failure here is almost always an unseeded database rather than bad credentials,
      // but the copy stays the same — the panel must not become an email oracle either.
      setError(signInErrorMessage(err));
      setPendingEmail(null);
    }
  }

  return (
    <Card className="border border-dashed border-border bg-muted/40 ring-0">
      <CardHeader>
        <CardTitle>
          <h2>Demo accounts</h2>
        </CardTitle>
        <CardDescription>
          This is a review build. All three accounts use the password{" "}
          {/* `select-all` so one click selects the whole token: a reviewer can also sign in
              by hand, or test a wrong password against a real account. */}
          <code className="select-all rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
            {DEMO_PASSWORD}
          </code>
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3">
        <ul className="grid gap-3">
          {DEMO_ACCOUNTS.map((account) => {
            const busy = pendingEmail === account.email;

            return (
              <li key={account.email} className="grid gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={pendingEmail !== null}
                  onClick={() => void signInAs(account.email)}
                >
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {busy ? "Signing in…" : `Sign in as ${account.name}`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {account.email} — {account.hint}
                </span>
              </li>
            );
          })}
        </ul>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
