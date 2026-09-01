import Link from "next/link";

import { UserMenu, type HeaderUser } from "@/components/layout/UserMenu";

/**
 * Brand + user menu, rendered once by `app/documents/layout.tsx` for every authenticated
 * route (04 §3). Server Component: it holds no state, and keeping it one keeps the client
 * bundle down to the dropdown itself.
 *
 * The user arrives as a prop rather than being read here so the header stays renderable
 * from anywhere — including before the session module exists.
 */
export function AppHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/documents"
          className="rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          shared-docs
        </Link>
        {user ? <UserMenu user={user} /> : null}
      </div>
    </header>
  );
}
