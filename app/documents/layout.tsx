import { AppHeader } from "@/components/layout/AppHeader";

// Shell for every authenticated route: the dashboard and the editor both hang off it, so
// the page container (mx-auto max-w-5xl px-6 py-8, 04 §5.1) belongs to the dashboard page
// rather than here — the editor needs the full width for its sticky strips and centres its
// own 720px prose column.
export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  // TODO(W3): replace with `await readSession()` from lib/session.ts and make this async.
  // Importing it today would not compile — T05 is still writing the module. `null` renders
  // the brand without the user menu, which is the correct signed-out state anyway.
  const user = null;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
