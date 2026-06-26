"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { ZodError } from "zod";
import type { AddFlightDialogProps } from "@/lib/uiContracts";
import { participantInputSchema, type ParticipantInput } from "@/lib/schema";
import {
  getStoredPasscode,
  setStoredPasscode,
  getEditToken,
  rememberEditToken,
  forgetEditToken,
} from "@/lib/clientStore";
import { AIRPORTS, DESTINATIONS, type Destination } from "@/lib/config";

// the add / edit flight dialog (SPEC sections 6, 10). a focus-managed modal:
// full-screen sheet on mobile, centered card on desktop. validates client-side
// with the shared zod schema before it ever hits the api, then maps server
// errors back onto the right fields. reduced-motion aware for the open tween.

// --- form state ---------------------------------------------------------------

interface FormFields {
  name: string;
  flightNumber: string;
  destination: Destination;
  originIata: string;
  originCity: string;
  arrivalDate: string;
  slackHandle: string;
  callsignOverride: string;
}

function blankFields(): FormFields {
  return {
    name: "",
    flightNumber: "",
    destination: DESTINATIONS[0],
    originIata: "",
    originCity: "",
    arrivalDate: "",
    slackHandle: "",
    callsignOverride: "",
  };
}

type FieldErrors = Partial<Record<keyof FormFields | "passcode", string>>;

// --- error parsing ------------------------------------------------------------

/** first message per field from a client-side zod failure. */
function issuesToFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key as keyof FieldErrors] = issue.message;
    }
  }
  return out;
}

interface ParsedApiError {
  message: string | null;
  fieldErrors: FieldErrors;
}

/** pull { error } and zod flatten issues out of an api error body, defensively. */
function parseApiError(v: unknown): ParsedApiError {
  const out: ParsedApiError = { message: null, fieldErrors: {} };
  if (!v || typeof v !== "object") return out;
  const obj = v as Record<string, unknown>;
  if (typeof obj.error === "string") out.message = obj.error;
  const issues = obj.issues;
  if (issues && typeof issues === "object") {
    const i = issues as Record<string, unknown>;
    const fe = i.fieldErrors;
    if (fe && typeof fe === "object") {
      for (const [k, val] of Object.entries(fe as Record<string, unknown>)) {
        const first = Array.isArray(val) ? val[0] : undefined;
        if (typeof first === "string") {
          out.fieldErrors[k as keyof FieldErrors] = first;
        }
      }
    }
    const formErrors = i.formErrors;
    const firstForm = Array.isArray(formErrors) ? formErrors[0] : undefined;
    if (typeof firstForm === "string") {
      out.message = firstForm;
    }
  }
  return out;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const GENERIC_ERROR = "could not save that, try again in a sec.";
const NETWORK_ERROR = "network hiccup, check your connection and try again.";

// --- small presentational fields (module scope so they keep focus) -----------

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  uppercase?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  autoComplete?: string;
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  type = "text",
  maxLength,
  uppercase,
  disabled,
  inputRef,
  className,
  autoComplete,
}: TextFieldProps) {
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errId : hint ? hintId : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-md border bg-panel-2 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-amber disabled:opacity-50 ${
          uppercase ? "uppercase" : ""
        } ${error ? "border-coral" : "border-line"}`}
      />
      {error ? (
        <p id={errId} className="mt-1 text-xs text-coral">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: Destination;
  onChange: (v: Destination) => void;
  disabled?: boolean;
  className?: string;
}

function DestinationField({
  id,
  label,
  value,
  onChange,
  disabled,
  className,
}: SelectFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Destination)}
        disabled={disabled}
        className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-text focus:border-amber disabled:opacity-50"
      >
        {DESTINATIONS.map((dest) => (
          <option key={dest} value={dest}>
            {dest} ({AIRPORTS[dest].name})
          </option>
        ))}
      </select>
    </div>
  );
}

// --- the dialog ---------------------------------------------------------------

export default function AddFlightDialog({
  open,
  editId,
  participants,
  onClose,
  onSaved,
}: AddFlightDialogProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const noteId = `${uid}-note`;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // read live participants without retriggering the init effect on every poll.
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  const [fields, setFields] = useState<FormFields>(blankFields);
  const [passcode, setPasscode] = useState("");
  const [editToken, setEditToken] = useState<string | undefined>(undefined);
  const [revealPasscode, setRevealPasscode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  const isEdit = editId != null;
  const participant = isEdit
    ? (participants.find((p) => p.id === editId) ?? null)
    : null;
  const missing = isEdit && participant == null;
  const showPasscode = !isEdit || !editToken || revealPasscode;

  function update<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => {
      const next: FormFields = { ...prev };
      next[key] = value;
      return next;
    });
  }

  // (re)seed the form whenever the dialog opens or switches target.
  useEffect(() => {
    if (!open) return;
    const p = editId
      ? (participantsRef.current.find((x) => x.id === editId) ?? null)
      : null;
    setFields({
      name: p?.name ?? "",
      flightNumber: p?.flightNumber ?? "",
      destination: p?.destination ?? DESTINATIONS[0],
      originIata: p?.origin?.iata ?? "",
      originCity: p?.origin?.city ?? "",
      arrivalDate: p?.arrivalDate ?? "",
      slackHandle: p?.slackHandle ?? "",
      callsignOverride: "",
    });
    // create reuses the remembered write passcode. edit needs the admin
    // passcode (a different secret), so start it blank rather than prefilling
    // the wrong value and 403ing silently.
    setPasscode(editId ? "" : getStoredPasscode());
    setEditToken(editId ? getEditToken(editId) : undefined);
    setRevealPasscode(false);
    setAdvancedOpen(false);
    setConfirmDelete(false);
    setFieldErrors({});
    setFormError(null);
  }, [open, editId]);

  // entrance tween, skipped under reduced motion.
  useEffect(() => {
    if (!open) {
      setShow(false);
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setShow(true);
      return;
    }
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // focus the first field on open, restore focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const t = window.setTimeout(() => {
      const target = firstFieldRef.current ?? cardRef.current;
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      opener?.focus();
    };
  }, [open]);

  // lock body scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const busy = submitting || deleting;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !cardRef.current) return;
    const focusable = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    // index of the focused element, or -1 when focus is on the dialog
    // container itself (tabIndex=-1, e.g. the missing state) or otherwise
    // outside the list. wrap in both cases so focus can never leak out.
    const activeIndex =
      active instanceof HTMLElement ? focusable.indexOf(active) : -1;
    if (e.shiftKey) {
      if (activeIndex <= 0) {
        e.preventDefault();
        last.focus();
      }
    } else if (activeIndex === -1 || activeIndex === focusable.length - 1) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleBackdrop(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  /** edit/delete auth: prefer the stored edit token, fall back to passcode. */
  function buildAuth(): { editToken: string } | { passcode: string } | null {
    if (editToken && !revealPasscode) return { editToken };
    const trimmed = passcode.trim();
    if (trimmed) return { passcode: trimmed };
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFieldErrors({});
    setFormError(null);

    const parsed = participantInputSchema.safeParse({
      name: fields.name,
      flightNumber: fields.flightNumber,
      destination: fields.destination,
      callsignOverride: fields.callsignOverride,
      originIata: fields.originIata,
      originCity: fields.originCity,
      arrivalDate: fields.arrivalDate,
      slackHandle: fields.slackHandle,
    });
    if (!parsed.success) {
      setFieldErrors(issuesToFieldErrors(parsed.error));
      setFormError("a couple fields need a look.");
      return;
    }

    if (isEdit) {
      await submitEdit(parsed.data);
    } else {
      await submitCreate(parsed.data);
    }
  }

  async function submitCreate(data: ParticipantInput) {
    const code = passcode.trim();
    if (!code) {
      setFieldErrors((prev) => ({
        ...prev,
        passcode: "enter the passcode from the cohort chat",
      }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: code, ...data }),
      });
      if (res.status === 201) {
        const body = await readJson(res);
        if (body && typeof body === "object") {
          const b = body as Record<string, unknown>;
          if (typeof b.id === "string" && typeof b.editToken === "string") {
            rememberEditToken(b.id, b.editToken);
          }
        }
        setStoredPasscode(code);
        onSaved();
        onClose();
        return;
      }
      if (res.status === 403) {
        setFieldErrors((prev) => ({
          ...prev,
          passcode: "that passcode is wrong. grab it from the cohort chat.",
        }));
        setFormError("that passcode is wrong. grab it from the cohort chat.");
        return;
      }
      if (res.status === 400) {
        const err = parseApiError(await readJson(res));
        if (Object.keys(err.fieldErrors).length)
          setFieldErrors(err.fieldErrors);
        setFormError(
          err.message ??
            "some fields did not validate, fix them and try again.",
        );
        return;
      }
      setFormError(GENERIC_ERROR);
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(data: ParticipantInput) {
    const id = editId;
    if (id == null) return;
    const auth = buildAuth();
    if (!auth) {
      setFieldErrors((prev) => ({
        ...prev,
        passcode: "enter the admin passcode to edit this entry",
      }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/participants/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, ...auth }),
      });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      if (res.status === 403) {
        setRevealPasscode(true);
        setFormError("that entry is not yours to edit, use the admin passcode");
        return;
      }
      if (res.status === 404) {
        setFormError("that flight is gone, it may have been removed");
        return;
      }
      if (res.status === 400) {
        const err = parseApiError(await readJson(res));
        if (Object.keys(err.fieldErrors).length)
          setFieldErrors(err.fieldErrors);
        setFormError(
          err.message ??
            "some fields did not validate, fix them and try again.",
        );
        return;
      }
      setFormError(GENERIC_ERROR);
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    const id = editId;
    if (id == null || busy) return;
    setFormError(null);
    const auth = buildAuth();
    if (!auth) {
      setFieldErrors((prev) => ({
        ...prev,
        passcode: "enter the admin passcode to remove this entry",
      }));
      setConfirmDelete(false);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/participants/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(auth),
      });
      if (res.ok) {
        forgetEditToken(id);
        onSaved();
        onClose();
        return;
      }
      if (res.status === 403) {
        setRevealPasscode(true);
        setFormError(
          "that entry is not yours to remove, use the admin passcode",
        );
        return;
      }
      if (res.status === 404) {
        setFormError("that flight is gone, it may have been removed");
        return;
      }
      setFormError(GENERIC_ERROR);
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const title = isEdit ? "edit your flight" : "add your flight";

  return (
    <div
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 z-50 flex justify-center bg-black/70 transition-opacity duration-200 sm:items-center sm:p-6 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={missing ? undefined : noteId}
        tabIndex={-1}
        className={`relative flex w-full flex-col gap-5 overflow-y-auto bg-panel p-5 text-text outline-none transition duration-200 sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-xl sm:border sm:border-line sm:p-6 ${
          show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber">
              fallout {"//"} arrivals
            </p>
            <h2
              id={titleId}
              className="font-display text-2xl font-bold tracking-tight text-text"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="rounded-md border border-line px-2 py-1 text-sm text-muted hover:bg-panel-2 hover:text-text"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {formError ? (
          <p
            role="alert"
            aria-live="assertive"
            className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral"
          >
            {formError}
          </p>
        ) : null}

        {missing ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              that flight is gone, it may have been removed. nothing to edit
              here.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-amber px-4 py-2 text-sm font-semibold text-bg hover:bg-amber-bright"
              >
                close
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                id={`${uid}-name`}
                label="name"
                value={fields.name}
                onChange={(v) => update("name", v)}
                error={fieldErrors.name}
                placeholder="your name"
                disabled={busy}
                inputRef={firstFieldRef}
                className="sm:col-span-2"
                autoComplete="name"
              />
              <TextField
                id={`${uid}-flight`}
                label="flight number"
                value={fields.flightNumber}
                onChange={(v) => update("flightNumber", v)}
                error={fieldErrors.flightNumber}
                hint="we match this to the live callsign. uppercase, no spaces."
                placeholder="CX216"
                uppercase
                disabled={busy}
                autoComplete="off"
              />
              <DestinationField
                id={`${uid}-dest`}
                label="destination"
                value={fields.destination}
                onChange={(v) => update("destination", v)}
                disabled={busy}
              />
              <TextField
                id={`${uid}-origin-iata`}
                label="origin code"
                value={fields.originIata}
                onChange={(v) => update("originIata", v)}
                error={fieldErrors.originIata}
                hint="3 letters, draws your route line"
                placeholder="DEL"
                maxLength={3}
                uppercase
                disabled={busy}
                autoComplete="off"
              />
              <TextField
                id={`${uid}-origin-city`}
                label="origin city"
                value={fields.originCity}
                onChange={(v) => update("originCity", v)}
                error={fieldErrors.originCity}
                placeholder="Delhi"
                disabled={busy}
                autoComplete="off"
              />
              <TextField
                id={`${uid}-arrival`}
                label="arrival date"
                type="date"
                value={fields.arrivalDate}
                onChange={(v) => update("arrivalDate", v)}
                error={fieldErrors.arrivalDate}
                disabled={busy}
              />
              <TextField
                id={`${uid}-slack`}
                label="slack handle"
                value={fields.slackHandle}
                onChange={(v) => update("slackHandle", v)}
                error={fieldErrors.slackHandle}
                placeholder="@fish"
                disabled={busy}
                autoComplete="off"
              />
              {showPasscode ? (
                <TextField
                  id={`${uid}-passcode`}
                  label="passcode"
                  value={passcode}
                  onChange={(v) => setPasscode(v)}
                  error={fieldErrors.passcode}
                  hint={
                    isEdit
                      ? "admin passcode to edit an entry that is not yours."
                      : "needed to add a flight. we remember it on this device."
                  }
                  placeholder="from the cohort chat"
                  disabled={busy}
                  className="sm:col-span-2"
                  autoComplete="off"
                />
              ) : null}
            </div>

            {isEdit ? (
              <p className="text-xs text-muted">
                leaving a field blank keeps its current value.
              </p>
            ) : null}

            <div className="rounded-md border border-line">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                aria-controls={`${uid}-advanced`}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-muted hover:text-text"
              >
                <span>advanced</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  className={`transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {advancedOpen ? (
                <div
                  id={`${uid}-advanced`}
                  className="border-t border-line p-3"
                >
                  <TextField
                    id={`${uid}-callsign`}
                    label="callsign override"
                    value={fields.callsignOverride}
                    onChange={(v) => update("callsignOverride", v)}
                    error={fieldErrors.callsignOverride}
                    hint="for codeshares or misses. the operating carrier callsign, like CPA216."
                    placeholder="CPA216"
                    uppercase
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </div>

            <p id={noteId} className="text-xs text-muted">
              heads up: a plane only shows on the map within ~250nm of the
              delta, and codeshares may need the callsign override.
            </p>

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              {isEdit ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">
                      remove this flight for good?
                    </span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="rounded-md bg-coral px-3 py-1.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? "removing..." : "yes, remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
                    >
                      keep it
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    className="self-start rounded-md border border-coral/40 px-3 py-1.5 text-sm text-coral hover:bg-coral/10 disabled:opacity-50"
                  >
                    remove my flight
                  </button>
                )
              ) : (
                <span />
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium text-text hover:bg-panel-2"
                >
                  cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-amber px-4 py-2 text-sm font-semibold text-bg hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "saving..."
                    : isEdit
                      ? "save changes"
                      : "add flight"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
