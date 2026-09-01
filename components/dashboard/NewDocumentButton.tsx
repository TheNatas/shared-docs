"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CreateDocumentResponse } from "@/lib/api-types";
import { apiFetch } from "@/lib/client";

/**
 * Creates a blank document and goes straight into the editor (04-ui-spec.md §5.3).
 *
 * The dashboard renders this twice — in the header row and inside the "My documents" empty
 * state — so the component owns no layout of its own and takes a `className` instead.
 */
export function NewDocumentButton({ className }: { className?: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [navigating, startNavigation] = useTransition();

  async function createDocument() {
    setCreating(true);
    try {
      // `{}` rather than no body at all. 02-api-contract.md §7.5 tolerates both, but
      // apiFetch sends `Content-Type: application/json` on every non-FormData request, and a
      // JSON content-type with a zero-length body is the shape most likely to trip a proxy.
      const doc = await apiFetch<CreateDocumentResponse>("/api/documents", {
        method: "POST",
        body: JSON.stringify({}),
      });

      // The response is a full DocumentSummary, not just `{ id }` — a superset the dashboard
      // could reuse. Here only the id is needed, because the destination is the editor.
      startNavigation(() => {
        router.push(`/documents/${doc.id}`);
      });
    } catch {
      // The only reachable failures are 401 (middleware already redirects) and 500. Neither
      // is something the user can act on differently, so there is one sentence and no switch
      // on `err.code`.
      toast.error("Couldn't create the document.");
      setCreating(false);
    }
  }

  // Deliberately left disabled through the route transition on success: re-enabling between
  // the 201 and the navigation flashes an armed button and invites a second empty document.
  const busy = creating || navigating;

  return (
    <Button className={className} disabled={busy} onClick={() => void createDocument()}>
      <Plus aria-hidden="true" />
      {busy ? "Creating…" : "New document"}
    </Button>
  );
}
