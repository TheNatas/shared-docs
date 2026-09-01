import type { MyRole } from "@/lib/api-types";
import { Badge } from "@/components/ui/badge";

/**
 * The caller's role on a document, as a word (04-ui-spec.md §5.2).
 *
 * Pure and server-rendered. The word is the accessible signal — the badge variant only
 * reinforces it, because colour alone is not an acceptable carrier of meaning (§10). Do not
 * "simplify" this into a coloured dot.
 */

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const ROLE_BADGE = {
  OWNER: { variant: "default", label: "Owner" },
  EDITOR: { variant: "secondary", label: "Editor" },
  VIEWER: { variant: "outline", label: "Viewer" },
} as const satisfies Record<MyRole, { variant: BadgeVariant; label: string }>;

export function RoleBadge({ role, className }: { role: MyRole; className?: string }) {
  const { variant, label } = ROLE_BADGE[role];

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
