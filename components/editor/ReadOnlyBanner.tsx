import { Eye } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The VIEWER affordance (04-ui-spec.md §6.8), rendered directly under the editor's top strip.
 *
 * This is a *label*, not a control. The enforcement is the server's 403 on PATCH
 * (00-foundation.md §6.3) and the `editable: false` on the canvas; both are covered by the
 * permission tests. A viewer who defeats the UI still cannot write.
 *
 * No `use client`: it holds no state, so it stays renderable from a Server Component even
 * though today its only caller is the client editor root.
 */
export function ReadOnlyBanner({ ownerName }: { ownerName: string }) {
  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-muted/40">
      <Eye aria-hidden="true" />
      <AlertTitle>View only</AlertTitle>
      <AlertDescription>
        {ownerName} shared this with you as a viewer.
      </AlertDescription>
    </Alert>
  );
}
