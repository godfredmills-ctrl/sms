"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Check,
  DoorClosed,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";

import { Modal } from "@/components/modal";
import { Alert, Avatar, Badge, Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { needsOverride } from "@/lib/cafeteria-rules";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import {
  closeServiceAction,
  findDinersAction,
  openServiceAction,
  serveAction,
  undoServeAction,
  type CafeteriaState,
  type DinerLookup,
} from "./actions";

type ServedRow = {
  id: string;
  name: string;
  reference: string;
  photoUrl: string | null;
  basis: string;
  chargedMinor: number;
  warned: boolean;
  warnedNote: string | null;
  servedBy: string | null;
};

/**
 * The queue.
 *
 * Type part of a name, see who it might be, see immediately whether the dish
 * in front of you is one they can eat, tap to serve. The search runs against
 * the server rather than a list shipped to the browser, because the answer
 * includes a pupil's allergies and a school with two thousand children should
 * not put two thousand medical summaries into a kitchen laptop's memory to
 * save a round trip.
 */
export function ServingCounter({
  service,
  sitting,
  servedOn,
  canServe,
  records,
}: {
  service: { id: string; closed: boolean; expectedCount: number } | null;
  sitting: string;
  servedOn: string;
  canServe: boolean;
  records: ServedRow[];
}) {
  const router = useRouter();

  if (!service) {
    return (
      <Card>
        <CardHeader
          title="Not open yet"
          description="Opening the sitting counts who is entitled to it, and that count is what makes the missing list mean anything afterwards."
        />
        <CardBody>
          {canServe ? (
            <OpenForm sitting={sitting} servedOn={servedOn} onOpened={() => router.refresh()} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Somebody with the serving permission has to open it.
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={service.closed ? "Closed" : "Serving"}
        description={
          service.closed
            ? "The register is closed. Nothing more can be added or removed."
            : `${records.length} served, ${service.expectedCount} entitled.`
        }
        action={
          !service.closed && canServe ? (
            <CloseForm serviceId={service.id} onClosed={() => router.refresh()} />
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {!service.closed && canServe ? (
          <Queue serviceId={service.id} onServed={() => router.refresh()} />
        ) : null}

        <ServedList
          records={records}
          canRemove={canServe && !service.closed}
          onChanged={() => router.refresh()}
        />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Submit({ label, busy, ...rest }: { label: string; busy: string } & Record<string, unknown>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} {...rest}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {pending ? busy : label}
    </Button>
  );
}

function OpenForm({
  sitting,
  servedOn,
  onOpened,
}: {
  sitting: string;
  servedOn: string;
  onOpened: () => void;
}) {
  const [state, action] = useActionState<CafeteriaState, FormData>(openServiceAction, {});

  useEffect(() => {
    if (state.ok) onOpened();
  }, [state.ok, onOpened]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sitting" value={sitting} />
      <input type="hidden" name="servedOn" value={servedOn} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Submit label="Open this sitting" busy="Opening…" />
    </form>
  );
}

function CloseForm({ serviceId, onClosed }: { serviceId: string; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(closeServiceAction, {});

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      onClosed();
    }
  }, [state.ok, onClosed]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <DoorClosed className="size-3.5" />
        Close
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Close this sitting">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={serviceId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            Closing fixes the register. Nobody else can be added and nothing can
            be removed, which is what makes the count of who did not come to
            this sitting worth reading. Do it when the hall is empty.
          </p>

          <Field label="Anything worth noting" htmlFor="notes">
            <Input id="notes" name="notes" placeholder="Ran out of stew at half past one" />
          </Field>

          <Submit label="Close the sitting" busy="Closing…" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

function Queue({ serviceId, onServed }: { serviceId: string; onServed: () => void }) {
  const [query, setQuery] = useState("");
  const [diners, setDiners] = useState<DinerLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<DinerLookup | null>(null);
  const box = useRef<HTMLInputElement>(null);

  // Debounced, because this fires per keystroke against the database and a
  // caterer types a name faster than a query comes back.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setDiners([]);
      setError(null);
      return;
    }

    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      findDinersAction(serviceId, term)
        .then((result) => {
          if (!live) return;
          if (result.ok) {
            setDiners(result.diners);
            setError(null);
          } else {
            setDiners([]);
            setError(result.error);
          }
        })
        .catch(() => {
          if (live) setError("The search could not run. Check the connection.");
        })
        .finally(() => {
          if (live) setSearching(false);
        });
    }, 250);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, serviceId]);

  const done = useCallback(() => {
    setChosen(null);
    setQuery("");
    setDiners([]);
    box.current?.focus();
    onServed();
  }, [onServed]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input
          ref={box}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or admission number"
          className="pl-9"
          autoFocus
          aria-label="Find the person to serve"
        />
        {searching ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-[var(--text-subtle)]" />
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {query.trim().length >= 2 && !searching && diners.length === 0 && !error ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nobody enrolled matches that.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {diners.map((diner) => (
          <li key={diner.studentId}>
            <button
              type="button"
              onClick={() => setChosen(diner)}
              disabled={diner.alreadyServed}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                "border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent",
                // A stop-level warning is the one thing on this screen that has
                // to be visible before anybody reads a word.
                needsOverride(diner.warnings) &&
                  "border-[var(--danger)] bg-[var(--danger-soft)] hover:bg-[var(--danger-soft)]",
              )}
            >
              <Avatar name={diner.name} src={diner.photoUrl} size={34} />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{diner.name}</span>
                <span className="numeric block truncate text-xs text-[var(--text-subtle)]">
                  {diner.admissionNo}
                  {diner.className ? ` · ${diner.className}` : ""}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                {diner.warnings.length ? (
                  <Badge tone={needsOverride(diner.warnings) ? "danger" : "warning"}>
                    {needsOverride(diner.warnings) ? (
                      <ShieldAlert className="size-3" />
                    ) : (
                      <AlertTriangle className="size-3" />
                    )}
                    {diner.warnings.map((warning) => warning.label).join(", ")}
                  </Badge>
                ) : null}

                {diner.alreadyServed ? (
                  <Badge tone="neutral">
                    <Check className="size-3" />
                    Served
                  </Badge>
                ) : diner.covered ? (
                  <Badge tone="success">On plan</Badge>
                ) : (
                  <Badge tone="warning">{formatMoney(diner.chargeMinor)}</Badge>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <GuestButton serviceId={serviceId} onServed={done} />

      <Modal
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={chosen ? `Serve ${chosen.name}` : ""}
      >
        {chosen ? (
          <ServeForm serviceId={serviceId} diner={chosen} onServed={done} />
        ) : null}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The confirmation, and where the allergy warning is actually read.
 *
 * A severe allergy needs a typed sentence saying what is being given instead.
 * That is deliberately more friction than a checkbox: a box gets ticked, and a
 * sentence has to be composed by somebody who has looked at the plate.
 */
function ServeForm({
  serviceId,
  diner,
  onServed,
}: {
  serviceId: string;
  diner: DinerLookup;
  onServed: () => void;
}) {
  const [state, action] = useActionState<CafeteriaState, FormData>(serveAction, {});
  const blocking = needsOverride(diner.warnings);

  useEffect(() => {
    if (state.ok) onServed();
  }, [state.ok, onServed]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="studentId" value={diner.studentId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {diner.warnings.length ? (
        <div
          className={cn(
            "rounded-xl border p-3",
            blocking
              ? "border-[var(--danger)] bg-[var(--danger-soft)]"
              : "border-[var(--warning)] bg-[var(--warning-soft)]",
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            {blocking ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
            {blocking ? "Do not serve this dish" : "Check before serving"}
          </p>

          <ul className="mt-2 space-y-2 text-sm">
            {diner.warnings.map((warning) => (
              <li key={warning.allergen}>
                <span className="font-medium">
                  {warning.label}, {warning.severity.toLowerCase()}
                </span>
                <span className="text-[var(--text-muted)]">
                  {" "}
                  (recorded as &ldquo;{warning.recordedAs}&rdquo;)
                </span>
                {warning.reaction ? (
                  <span className="block text-[var(--text-muted)]">
                    Reaction: {warning.reaction}
                  </span>
                ) : null}
                {warning.treatment ? (
                  <span className="block text-[var(--text-muted)]">
                    Treatment: {warning.treatment}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!diner.allergiesVisible ? (
        <Alert tone="warning">
          You cannot see medical records, so this screen has not checked this
          child&rsquo;s allergies against the dish. It has not found nothing; it has
          not looked.
        </Alert>
      ) : null}

      {blocking ? (
        <Field
          label="What are they being given instead"
          htmlFor="override"
          required
          hint="Recorded against this meal, with your name."
        >
          <Input
            id="override"
            name="override"
            required
            maxLength={200}
            placeholder="Plain rice and chicken from the second pot"
          />
        </Field>
      ) : null}

      <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-sm">
        <p className="font-medium">
          {diner.covered ? "On their meal plan" : formatMoney(diner.chargeMinor)}
        </p>
        <p className="text-[var(--text-muted)]">{diner.note}</p>
        {diner.planName ? (
          <p className="text-[var(--text-muted)]">Plan: {diner.planName}</p>
        ) : null}
      </div>

      <Submit
        label={diner.chargeMinor > 0 ? `Serve and collect ${formatMoney(diner.chargeMinor)}` : "Serve"}
        busy="Recording…"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------

function GuestButton({ serviceId, onServed }: { serviceId: string; onServed: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<CafeteriaState, FormData>(serveAction, {});

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      onServed();
    }
  }, [state.ok, onServed]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="size-3.5" />
        A guest
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Serve a guest">
        <form action={action} className="space-y-4">
          <input type="hidden" name="serviceId" value={serviceId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label="Name" htmlFor="guestName" required>
            <Input id="guestName" name="guestName" required placeholder="Ghana Education Service inspector" />
          </Field>

          <Field label="Charged" htmlFor="charge" hint="In cedis. Leave at zero if the meal is on the school.">
            <Input id="charge" name="charge" type="number" step="0.01" min="0" defaultValue="0" />
          </Field>

          <Submit label="Serve" busy="Recording…" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

function ServedList({
  records,
  canRemove,
  onChanged,
}: {
  records: ServedRow[];
  canRemove: boolean;
  onChanged: () => void;
}) {
  if (!records.length) {
    return (
      <p className="border-t border-[var(--border)] pt-4 text-sm text-[var(--text-muted)]">
        Nobody has been served yet.
      </p>
    );
  }

  return (
    <div className="border-t border-[var(--border)] pt-4">
      <p className="mb-2 text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
        Served, most recent first
      </p>
      <ul className="divide-y divide-[var(--border)]">
        {records.map((record) => (
          <li key={record.id} className="flex items-center gap-3 py-2">
            <Avatar name={record.name} src={record.photoUrl} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{record.name}</span>
              <span className="numeric block truncate text-xs text-[var(--text-subtle)]">
                {record.reference}
                {record.servedBy ? ` · by ${record.servedBy}` : ""}
              </span>
              {record.warnedNote ? (
                <span className="block truncate text-xs text-[var(--danger)]">
                  Given instead: {record.warnedNote}
                </span>
              ) : null}
            </span>

            {record.warned ? (
              <Badge tone="warning">
                <AlertTriangle className="size-3" />
              </Badge>
            ) : null}

            <Badge tone={record.basis === "PLAN" ? "success" : "warning"}>
              {record.basis === "PLAN" ? "Plan" : formatMoney(record.chargedMinor)}
            </Badge>

            {canRemove ? <UndoButton id={record.id} onDone={onChanged} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UndoButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      title="Remove from this sitting"
      aria-label="Remove from this sitting"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const body = new FormData();
        body.set("id", id);
        await undoServeAction(body);
        setBusy(false);
        onDone();
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-subtle)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}
