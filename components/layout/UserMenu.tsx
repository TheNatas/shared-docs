"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The header only ever renders a name and an email, so it asks for exactly that.
 * Structurally a subset of `UserSummary` (`lib/api-types.ts`, owned by 02 §3), which is
 * what the caller will hand it once the session layer lands — a wider object satisfies
 * this without a cast, and the header does not gain a compile-time dependency on the
 * auth module for two strings.
 */
export type HeaderUser = {
  name: string;
  email: string;
};

export function UserMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // POST /api/auth/logout is public and always 200s — with no cookie, an expired one or
    // a forged one (00 §7). There is nothing to branch on: the only sane response to a
    // network failure here is still to leave the authenticated area.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    }
  }

  const busy = signingOut || pending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-[14rem]">
          <span className="truncate">{user.name}</span>
          <ChevronDown className="opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          // Keep the menu open while the request is in flight, so "Signing out…" is
          // visible instead of the menu vanishing onto an unchanged page.
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          {busy ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
