"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { FileText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { EditorHeader } from "@/components/editor/EditorHeader";
import { EditorTitle } from "@/components/editor/EditorTitle";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ReadOnlyBanner } from "@/components/editor/ReadOnlyBanner";
import { SaveStatus } from "@/components/editor/SaveStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShareDialog } from "@/components/share/ShareDialog";
import { useAutosave } from "@/hooks/useAutosave";
import type { DocumentDetail, GetDocumentResponse } from "@/lib/api-types";
import { apiFetch } from "@/lib/client";
import { editorExtensions } from "@/lib/editor-extensions";

/** `aria-controls` on the toolbar has to name the surface the toolbar operates on. */
const CANVAS_ID = "document-canvas";

/**
 * The client root of `/documents/[id]` (04-ui-spec.md §6.3).
 *
 * It receives the whole `DocumentDetail` from the Server Component and never fetches on
 * mount, so the canvas paints filled on the first frame instead of flashing empty. The one
 * fetch it does own is the conflict reload, which is a user action.
 */
export function DocumentEditor({ doc }: { doc: DocumentDetail }) {
  const canWrite = doc.myRole === "OWNER" || doc.myRole === "EDITOR";
  const isOwner = doc.myRole === "OWNER";

  // The title lives here rather than inside EditorTitle so a conflict reload can replace it.
  const [title, setTitle] = useState(doc.title);
  const [contentError, setContentError] = useState(false);
  const [reloading, setReloading] = useState(false);

  // The owner-only action slot in the top strip. ShareDialog self-gates on
  // `doc.shares === null` (the ownership signal), so it is mounted unconditionally and
  // decides for itself whether to render — an EDITOR never sees a Share button
  // (04-ui-spec.md §8, §6.8).
  const shareSlot: ReactNode = <ShareDialog doc={doc} />;

  // `useEditor` runs after `useAutosave` and the editor does not exist yet when the hook's
  // options are built, so the 403 handler reaches it through a ref rather than a closure.
  const editorRef = useRef<Editor | null>(null);

  const autosave = useAutosave({
    documentId: doc.id,
    initialUpdatedAt: doc.updatedAt,
    enabled: canWrite,
    // `onConflict` is deliberately not passed. The banner is the `conflict` state of
    // SaveStatus (DECISIONS.md D002, 04-ui-spec.md §6.9), so it already renders from
    // `autosave.state`; a second boolean here would be a second source of truth for one fact,
    // and the two would eventually disagree.
    //
    // A 403 mid-session means the share was revoked while the tab was open. The server has
    // already refused the write; taking the canvas out of edit mode stops the user typing
    // into a document that can no longer accept it (§6.6).
    onForbidden: () => editorRef.current?.setEditable(false),
  });

  // `useEditor` builds its event handlers once, so reading the hook result through a ref
  // keeps `onUpdate` pointing at the current autosave instance rather than at the closure
  // captured on the first render.
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  });

  const editor = useEditor({
    extensions: editorExtensions, // THE list — lib/editor-extensions.ts, shared with the importer
    // `ProseMirrorDoc` and TipTap's `JSONContent` describe the same JSON; they differ only in
    // that the wire type declares its children `unknown[]` (it is what crosses a trust
    // boundary) while TipTap declares them `JSONContent[]`. This is the single place the two
    // vocabularies meet, so the assertion is made once, here, and nowhere else.
    content: doc.content as JSONContent,
    editable: canWrite,
    immediatelyRender: false, // ProseMirror cannot render during SSR
    // Not optional (04-ui-spec.md §6.3). Without it a stored node the schema does not know
    // throws at mount and white-screens the whole route; with it ProseMirror reports the
    // error and we can render something a reviewer can act on.
    enableContentCheck: true,
    onContentError: ({ error }) => {
      console.error("[editor] unrenderable content", error);
      setContentError(true);
    },
    onUpdate: ({ editor: e }) => autosaveRef.current.queue({ content: e.getJSON() }),
    onBlur: () => {
      void autosaveRef.current.flush();
    },
    editorProps: {
      attributes: {
        id: CANVAS_ID,
        class: "prose-doc focus:outline-none",
        "aria-label": "Document content",
      },
    },
  });

  // Ref writes belong in an effect, not in the render body. Nothing can call `onForbidden`
  // before the first effect flush — it takes a round trip to the server to get a 403.
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      // A momentarily blank title is not sent: `patchDocumentSchema.title` is `min(1)` after
      // trimming, so queueing "" would guarantee a 400 mid-edit. Blur normalises it to
      // "Untitled document" and queues that.
      if (next.trim() !== "") autosave.queue({ title: next });
    },
    [autosave],
  );

  const handleTitleCommit = useCallback(() => {
    void autosave.flush();
  }, [autosave]);

  /**
   * The `Reload` button of the conflict banner (04-ui-spec.md §6.9) — the only action it
   * offers. `resolveConflict` cannot touch the canvas itself (the hook holds no editor), so
   * the content swap happens here and the hook is told afterwards.
   */
  const handleReload = useCallback(async () => {
    setReloading(true);
    try {
      const fresh = await apiFetch<GetDocumentResponse>(`/api/documents/${doc.id}`);
      // `emitUpdate: false`: replacing the canvas is not a user edit, and letting it fire
      // `onUpdate` would re-dirty the document the instant the conflict was resolved.
      editor?.commands.setContent(fresh.content as JSONContent, { emitUpdate: false });
      setTitle(fresh.title);
      autosave.resolveConflict(fresh);
    } catch {
      // The banner stays up: a failed reload has resolved nothing, and the only honest
      // state is still "this document changed elsewhere".
      toast.error("Couldn't reload this document.");
    } finally {
      setReloading(false);
    }
  }, [autosave, doc.id, editor]);

  return (
    <div className="flex flex-col">
      <EditorHeader
        onBeforeLeave={canWrite ? () => autosave.flush() : undefined}
        status={
          canWrite ? (
            <SaveStatus
              state={autosave.state}
              lastSavedAt={autosave.lastSavedAt}
              errorMessage={autosave.errorMessage}
              errorKind={autosave.errorKind}
              reloading={reloading}
              onRetry={() => void autosave.retry()}
              onReload={() => void handleReload()}
            />
          ) : null
        }
        ownerActions={isOwner ? shareSlot : null}
      />

      {!canWrite ? <ReadOnlyBanner ownerName={doc.owner.name} /> : null}

      <div className="mx-auto w-full max-w-[720px] px-4 pt-6">
        <EditorTitle
          value={title}
          editable={canWrite}
          onChange={handleTitleChange}
          onCommit={handleTitleCommit}
          onEnter={() => editor?.commands.focus()}
        />
        {doc.sourceFilename ? (
          <p className="mt-1 flex items-center gap-1.5 px-2 text-sm text-muted-foreground">
            <FileText aria-hidden="true" className="size-3.5" />
            Imported from {doc.sourceFilename}
          </p>
        ) : null}
      </div>

      {/* Not wrapped in a positioning div: `position: sticky` is confined to its parent's
          box, so a wrapper the height of the toolbar would cancel the stickiness outright. */}
      {canWrite ? <EditorToolbar editor={editor} controlsId={CANVAS_ID} /> : null}

      {contentError ? (
        <div className="mx-auto w-full max-w-[720px] px-4 pt-6">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>This document can&apos;t be displayed</AlertTitle>
            <AlertDescription>
              It contains formatting this editor doesn&apos;t support.{" "}
              <Link href="/documents">Back to documents</Link>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex-1 px-4">
        {/* `.prose-doc` is applied to the ProseMirror surface itself through
            `editorProps.attributes`, not to this wrapper, so the 720px measure and the
            heading scale belong to the editable element (04-ui-spec.md §6.7). */}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
