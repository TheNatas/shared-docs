"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApiErrorCode, ImportDocumentResponse } from "@/lib/api-types";
import { apiFetch, isApiClientError } from "@/lib/client";
import { formatBytes } from "@/lib/format";
import {
  ACCEPTED_EXTENSIONS,
  IMPORT_ACCEPT_ATTR,
  IMPORT_LIMITS_COPY,
  IMPORT_MESSAGES,
  MAX_FILE_BYTES,
} from "@/lib/import/constants";
import { cn } from "@/lib/utils";

/**
 * The import entry point (05-import-spec.md §9). It sits beside **New document** because both
 * are document-creation entry points, and it states the limits as permanent copy rather than
 * hiding them behind a dialog — requirement C8 asks for the limits to be visible in the UI,
 * and a sentence you have to open something to read is not.
 *
 * Every user-facing sentence here comes from a constant or from the server. The component
 * hard-codes no extension list, no byte count and no error copy of its own except the
 * network-failure fallback, so the picker, the route and the README cannot advertise three
 * different limits (05-import-spec.md §2.3).
 */

/** The one sentence this component owns: the request never reached the API. */
const NETWORK_MESSAGE = "Upload failed. Try again.";

/**
 * A problem with the *file* is fixed by choosing a different one; anything else is fixed by
 * sending the same one again. That distinction is the only thing this component reads
 * `err.code` for — the sentences stay the server's, per 02-api-contract.md I12 (branch on the
 * code, never on the message).
 */
const FILE_PROBLEM_CODES = new Set<ApiErrorCode>([
  "FILE_MISSING",
  "UNSUPPORTED_FILE_TYPE",
  "FILE_TOO_LARGE",
  "PARSE_FAILED",
  "CONTENT_TOO_LARGE",
]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Returns the message to show, or `null` when the file is worth uploading.
 *
 * The two sentences are the server's own, imported rather than retyped: a pre-check that
 * saved a round trip but worded the rejection differently would be worse than no pre-check
 * at all (05-import-spec.md §6.2 rows 3 and 5).
 */
function precheck(file: File): string | null {
  // `accept` is a hint only — every OS picker offers "All files" — so the extension is checked
  // here and again on the server. Case-insensitive, matching 02-api-contract.md §7.6.
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return IMPORT_MESSAGES.unsupportedType;
  }
  if (file.size > MAX_FILE_BYTES) return IMPORT_MESSAGES.fileTooLarge;
  return null;
}

export function ImportButton({ className }: { className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Kept out of state: only the retry handler reads it, and it never affects a render. */
  const pendingFile = useRef<File | null>(null);

  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [navigating, startNavigation] = useTransition();

  async function upload(file: File) {
    setImporting(true);
    setError(null);

    const body = new FormData();
    body.append("file", file);

    try {
      // No explicit Content-Type: apiFetch leaves a FormData body's headers alone so the
      // browser can add the multipart boundary itself.
      const doc = await apiFetch<ImportDocumentResponse>("/api/documents/import", {
        method: "POST",
        body,
      });

      // Straight into the editor — the imported document is what the user came for. The row
      // is committed before the 201, so the editor page's server-side read always finds it.
      startNavigation(() => {
        router.push(`/documents/${doc.id}`);
        router.refresh();
      });
    } catch (err) {
      // Rendered verbatim. The server owns every import sentence (05-import-spec.md §6.2) so
      // that the limits it enforces and the limits this control advertises cannot drift.
      setError(isApiClientError(err) ? err.message : NETWORK_MESSAGE);
      setRetryable(!isApiClientError(err) || !FILE_PROBLEM_CODES.has(err.code));
      setImporting(false);
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared immediately so re-picking the same file still fires `change` — otherwise a
    // retry after a transient failure looks like a dead button.
    event.target.value = "";
    if (!file) return;

    pendingFile.current = file;
    setPicked({ name: file.name, size: file.size });

    const problem = precheck(file);
    if (problem) {
      // No request is sent. The server re-checks both conditions anyway; this is UX only.
      setError(problem);
      setRetryable(false);
      return;
    }

    void upload(file);
  }

  const busy = importing || navigating;

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        // Never reachable by keyboard or screen reader: the Button below is the control, and
        // exposing both would announce two ways to do one thing, the second unlabelled.
        tabIndex={-1}
        aria-hidden="true"
        accept={IMPORT_ACCEPT_ATTR}
        onChange={onPick}
      />

      <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload aria-hidden="true" />
        {busy ? "Importing…" : "Import file"}
      </Button>

      {/* Permanent copy, not an error state — C8 requires the limits stated in the UI, and the
          same constant is asserted to appear in README.md by lib/import/limits-copy.test.ts. */}
      <p className="text-sm text-muted-foreground">{IMPORT_LIMITS_COPY}</p>

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          {picked !== null && (
            <AlertDescription>
              {picked.name} ({formatBytes(picked.size)})
            </AlertDescription>
          )}
          {retryable && (
            <AlertAction>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  const file = pendingFile.current;
                  if (file) void upload(file);
                }}
              >
                Try again
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
    </div>
  );
}
