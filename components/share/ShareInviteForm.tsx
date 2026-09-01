"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type {
  CreateShareResponse,
  ShareEntry,
  ShareRole,
  UserSearchResponse,
  UserSummary,
} from "@/lib/api-types";
import { apiFetch, isApiClientError } from "@/lib/client";
import { createShareSchema } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL } from "@/components/share/ShareRow";
import { cn } from "@/lib/utils";

/** `specs/04-ui-spec.md` §8.2: debounced 250 ms, and nothing is queried under 2 characters. */
const SUGGEST_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
/** §8.3 caps the listbox at five rows; the endpoint itself takes 10. */
const MAX_SUGGESTIONS = 5;

type Message = { tone: "error" | "muted"; text: string };

/**
 * Every failure of the invite is surfaced **inline**, keyed on `err.code` and never on
 * `err.message` (`02-api-contract.md` I12 — the code is the contract, the message is English
 * that may be reworded). Copy is verbatim from `04-ui-spec.md` §8.5.
 */
function inviteErrorCopy(err: unknown): string {
  if (!isApiClientError(err)) return "Couldn't share right now. Try again.";

  switch (err.code) {
    case "USER_NOT_FOUND":
      return "No user with that email address. Try alice@example.com, bob@example.com or carol@example.com.";
    case "CANNOT_SHARE_WITH_SELF":
      return "You already own this document.";
    case "FORBIDDEN":
      // Defensive: the whole dialog is owner-only, so reaching this means the server and the
      // page disagree about who is asking. The server's answer is the one that counts.
      return "Only the owner can share this document.";
    case "NOT_FOUND":
      return "This document no longer exists.";
    case "VALIDATION_FAILED":
      return "Enter a valid email address.";
    default:
      return "Couldn't share right now. Try again.";
  }
}

export type ShareInviteFormProps = {
  documentId: string;
  /** Current collaborators — read for the "Already shared" suffix and the upsert wording. */
  shares: ShareEntry[];
  /** Hands the upserted entry back to the dialog, which merges it into the existing row. */
  onShared: (share: ShareEntry) => void;
};

export function ShareInviteForm({ documentId, shares, onShared }: ShareInviteFormProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-email`;
  const listboxId = `${fieldId}-listbox`;
  const messageId = `${fieldId}-message`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("VIEWER");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const sharedEmails = new Set(shares.map((share) => share.user.email.toLowerCase()));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    // The same schema the route handler parses, so a malformed address is caught here with
    // the §8.5 copy instead of coming back as an anonymous 400 (`04-ui-spec.md` §4.2).
    const parsed = createShareSchema.safeParse({ email, role });
    if (!parsed.success) {
      setMessage({ tone: "error", text: "Enter a valid email address." });
      return;
    }

    // Captured before the request: the POST upserts and returns `created: false` for both
    // "same role again" and "role changed", and only the previous role separates them.
    const previousRole = shares.find(
      (share) => share.user.email.toLowerCase() === parsed.data.email,
    )?.role;

    setSubmitting(true);
    setMessage(null);
    try {
      const { share, created } = await apiFetch<CreateShareResponse>(
        `/api/documents/${documentId}/shares`,
        { method: "POST", body: JSON.stringify(parsed.data) },
      );

      onShared(share);
      setEmail("");
      setRole("VIEWER");
      inputRef.current?.focus();

      if (created) {
        toast.success(`Shared with ${share.user.name}.`);
      } else if (previousRole === share.role) {
        // Not an error — re-sharing at the same role is a successful no-op upsert, so it
        // reads muted rather than destructive.
        setMessage({
          tone: "muted",
          text: `${share.user.name} already has ${ROLE_LABEL[share.role]} access.`,
        });
      } else {
        setMessage({
          tone: "muted",
          text: `Updated ${share.user.name} to ${ROLE_LABEL[share.role]}.`,
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: inviteErrorCopy(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <Label htmlFor={inputId}>Invite someone</Label>

      <div className="flex items-start gap-2">
        <UserAutocomplete
          inputId={inputId}
          listboxId={listboxId}
          describedBy={message ? messageId : undefined}
          inputRef={inputRef}
          value={email}
          onValueChange={(next) => {
            setEmail(next);
            setMessage(null);
          }}
          sharedEmails={sharedEmails}
          disabled={submitting}
        />

        <Select
          value={role}
          disabled={submitting}
          onValueChange={(next) => {
            if (next !== "VIEWER" && next !== "EDITOR") return;
            setRole(next);
          }}
        >
          <SelectTrigger className="w-28" aria-label="Role for the person you are inviting">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VIEWER">{ROLE_LABEL.VIEWER}</SelectItem>
            <SelectItem value="EDITOR">{ROLE_LABEL.EDITOR}</SelectItem>
          </SelectContent>
        </Select>

        {/* Never disabled on an empty field: an empty submit is how the "Enter a valid email
            address." message gets shown, and a dead button explains nothing. */}
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Share
        </Button>
      </div>

      {message ? (
        <p
          id={messageId}
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "text-sm",
            message.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

type UserAutocompleteProps = {
  inputId: string;
  listboxId: string;
  describedBy?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onValueChange: (value: string) => void;
  /** Lowercased emails that already have access. */
  sharedEmails: ReadonlySet<string>;
  disabled?: boolean;
};

/**
 * A hand-rolled combobox over `GET /api/users?q=` (§8.3). `cmdk`'s async-results wiring costs
 * more than the four keys handled below.
 *
 * The suggestions are a convenience, never a gate: the API takes an **email**, so a free-typed
 * address submits identically to a picked one and nothing waits on the listbox.
 */
function UserAutocomplete({
  inputId,
  listboxId,
  describedBy,
  inputRef,
  value,
  onValueChange,
  sharedEmails,
  disabled,
}: UserAutocompleteProps) {
  const [options, setOptions] = useState<UserSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // Picking an option writes the email into `value`, which would otherwise re-run the search
  // effect and pop the list straight back open over the field the user just filled.
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }

    const q = value.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setHighlight(-1);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<UserSearchResponse>(`/api/users?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          const users = res.users.slice(0, MAX_SUGGESTIONS);
          setOptions(users);
          setHighlight(-1);
          setOpen(users.length > 0);
        })
        .catch(() => {
          // An aborted keystroke is not a failure, and a failed lookup is not worth an error
          // state — the typed address still submits.
          if (!controller.signal.aborted) {
            setOptions([]);
            setOpen(false);
          }
        });
    }, SUGGEST_DEBOUNCE_MS);

    // Cancels both halves on every keystroke: the pending debounce and the request it started.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function pick(user: UserSummary) {
    // Only arm the guard when the value really changes — otherwise (the user typed the exact
    // address, then clicked its row) the effect never runs and the flag would eat the search
    // for the *next* keystroke instead.
    justPicked.current = user.email !== value;
    onValueChange(user.email);
    setOpen(false);
    setHighlight(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => {
        const next = current + step;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      const picked = open && highlight >= 0 ? options[highlight] : undefined;
      if (picked) {
        // Choosing a row is not confirming the invite, so this must not reach the form.
        event.preventDefault();
        pick(picked);
      }
      // With nothing highlighted the native submit runs — that is "submits the raw typed email".
      return;
    }

    if (event.key === "Escape") {
      // Only swallow Escape while the list is open. Otherwise it belongs to the Dialog, and
      // eating it would leave a modal that cannot be closed from the keyboard.
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }

    if (event.key === "Tab") {
      // Closes the list and keeps whatever was typed.
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1">
      <Input
        id={inputId}
        ref={inputRef}
        type="email"
        placeholder="Email address"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        // Only while the list exists — a dangling `aria-controls` points assistive tech at
        // an element that is not in the document.
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && highlight >= 0 ? `${listboxId}-${highlight}` : undefined}
        aria-describedby={describedBy}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
      />

      {open && options.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md"
        >
          {options.map((user, index) => (
            <li
              key={user.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                index === highlight && "bg-muted",
              )}
              // mousedown fires before blur; preventing its default keeps focus in the input
              // so the click that follows still lands on a mounted row.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => pick(user)}
            >
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{user.email}</span>
              {sharedEmails.has(user.email.toLowerCase()) ? (
                <span className="shrink-0 text-xs text-muted-foreground">Already shared</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
