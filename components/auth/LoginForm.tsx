"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginResponse } from "@/lib/api-types";
import { apiFetch, isApiClientError } from "@/lib/client";
import { loginSchema, type LoginInput } from "@/lib/schemas";

/**
 * The credential form (04-ui-spec.md §4.2/§4.3).
 *
 * `useSignIn` and `signInErrorMessage` are exported because DemoAccountPanel performs the
 * *same* mutation from a different affordance — one click instead of two fields — and two
 * copies of "POST, then replace, then refresh" is how the demo buttons end up pushing onto
 * the history stack after this one stopped. They live beside their primary consumer rather
 * than in a fourth module: T14 owns exactly three files.
 */

/** Post the credentials and leave for the authenticated area. Throws `ApiClientError`. */
export function useSignIn(nextPath: string) {
  const router = useRouter();

  return useCallback(
    async (credentials: LoginInput) => {
      await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      // `replace`, never `push`: after signing in, Back must not land on a dead form
      // (04 §4.3). `refresh` re-renders the server tree with the cookie now attached.
      router.replace(nextPath);
      router.refresh();
    },
    [router, nextPath],
  );
}

/**
 * Branch on `err.code`, never on `err.message` (02-api-contract.md I12).
 *
 * The credential copy is deliberately non-specific — it never reveals whether the email
 * exists, which is the client half of the server's single INVALID_CREDENTIALS response
 * (03-auth-and-permissions.md).
 */
export function signInErrorMessage(err: unknown): string {
  if (isApiClientError(err) && err.code === "INVALID_CREDENTIALS") {
    return "Email or password is incorrect.";
  }
  return "Couldn't sign in. Please try again.";
}

type FieldErrors = { email?: string; password?: string };

export function LoginForm({ nextPath }: { nextPath: string }) {
  const signIn = useSignIn(nextPath);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // The same schema the route parses (lib/schemas.ts, imported not re-declared), so the
    // client cannot accept something the server rejects — or reject something it accepts.
    // Note there is no `min(8)`: a short *wrong* password must reach the server and come
    // back as the 401 this page exists to demonstrate.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const { fieldErrors: issues } = z.flattenError(parsed.error);
      setFieldErrors({
        email: issues.email ? "Enter a valid email address." : undefined,
        password: issues.password ? "Enter your password." : undefined,
      });
      return; // no request fires
    }

    setFieldErrors({});
    setPending(true);

    try {
      // `parsed.data`, not the raw state: the schema trims and lowercases the email, so a
      // pasted " Alice@Example.com " is normalised before it goes over the wire.
      await signIn(parsed.data);
      // No `setPending(false)` on success — the navigation is already under way, and
      // flipping the button back to "Sign in" flashes a live form over a leaving page.
    } catch (err) {
      setFormError(signInErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent>
        {/* `noValidate` keeps `type=email` + `required` for autofill and assistive tech while
            handing the *messages* to Zod. Without it the browser's own bubble intercepts an
            invalid address first, and the field error specced above never renders. */}
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email ? (
              <p id="email-error" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password ? (
              <p id="password-error" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {/* Above the submit button, per the §4.1 wireframe. `Alert` carries `role="alert"`
              itself, so the message is announced without stealing focus. */}
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
