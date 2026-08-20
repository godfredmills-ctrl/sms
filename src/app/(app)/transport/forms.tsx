"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Bus, Plus } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Button,
  CardBody,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

import {
  saveRouteAction,
  saveVehicleAction,
  type TransportState,
} from "./actions";

/**
 * A route and its stops.
 *
 * The stops are one textarea rather than a repeating row of fields, because a
 * route is a list somebody already has written down — on paper, in a
 * WhatsApp message — and retyping it into eleven pairs of inputs is how it
 * ends up not being entered at all. The format is shown, not validated into
 * submission: a line with only a name still becomes a stop.
 */
export function RouteForm() {
  const [state, action] = useActionState<TransportState, FormData>(saveRouteAction, {});
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((key) => key + 1);
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
          <Field label="Code" htmlFor="route-code" required>
            <Input
              id="route-code"
              name="code"
              required
              placeholder="R3"
              className="uppercase"
            />
          </Field>
          <Field label="Name" htmlFor="route-name" required>
            <Input id="route-name" name="name" required placeholder="Spintex — Tema" />
          </Field>
        </div>

        <Field
          label="Stops"
          htmlFor="route-stops"
          hint="Name | landmark | pick-up | drop-off — one per line, in order."
        >
          <Textarea
            id="route-stops"
            name="stops"
            rows={5}
            className="font-mono text-xs"
            placeholder={
              "Spintex Junction | opposite Total | 06:40 | 15:40\nBaatsona | by the traffic light | 06:55 | 15:25\nTema Community 7 | 07:15 | 15:05"
            }
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Roughly how long" htmlFor="route-duration" hint="Minutes.">
            <Input id="route-duration" name="durationMins" inputMode="numeric" />
          </Field>
          <Field label="Termly fee" htmlFor="route-fee" hint="Leave empty if not billed.">
            <Input id="route-fee" name="fee" inputMode="decimal" placeholder="0.00" />
          </Field>
        </div>

        <Submit icon={<Plus className="size-4" />} label="Add route" busy="Saving…" />
      </CardBody>
    </form>
  );
}

/** A bus, its driver, and the two dates that ground it. */
export function VehicleForm({
  routes,
  staff,
}: {
  routes: SelectOption[];
  staff: SelectOption[];
}) {
  const [state, action] = useActionState<TransportState, FormData>(saveVehicleAction, {});
  const [driverIsStaff, setDriverIsStaff] = useState(true);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.ok) setFormKey((key) => key + 1);
  }, [state]);

  return (
    <form key={formKey} action={action}>
      <CardBody className="space-y-3">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registration" htmlFor="bus-reg" required>
            <Input
              id="bus-reg"
              name="registration"
              required
              placeholder="GT 4821-24"
              className="uppercase"
            />
          </Field>
          <Field label="Seats" htmlFor="bus-capacity" required hint="Children, not counting crew.">
            <Input
              id="bus-capacity"
              name="capacity"
              inputMode="numeric"
              required
              defaultValue="30"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Make" htmlFor="bus-make">
            <Input id="bus-make" name="make" placeholder="Toyota Coaster" />
          </Field>
          <Field label="Route" htmlFor="bus-route">
            <SearchableSelect
              id="bus-route"
              name="routeId"
              options={routes}
              placeholder="Not on a route yet"
            />
          </Field>
        </div>

        <div className="flex gap-1.5">
          {[
            { value: true, label: "Driver is staff" },
            { value: false, label: "Contracted driver" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setDriverIsStaff(option.value)}
              className={
                driverIsStaff === option.value
                  ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {/*
          Keyed, so switching between the two does not leave the discarded
          control's value in the submission — a select keeps its choice in its
          own state, and without a key React treats these as one component.
        */}
        {driverIsStaff ? (
          <Field label="Driver" htmlFor="bus-driver-staff">
            <SearchableSelect
              key="driver-staff"
              id="bus-driver-staff"
              name="driverStaffId"
              options={staff}
              placeholder="Search staff…"
              searchPlaceholder="Name or job title…"
            />
          </Field>
        ) : (
          <Field label="Driver" htmlFor="bus-driver-name">
            <Input key="driver-name" id="bus-driver-name" name="driverName" />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Driver's phone" htmlFor="bus-driver-phone">
            <Input id="bus-driver-phone" name="driverPhone" inputMode="tel" />
          </Field>
          <Field label="Bus assistant" htmlFor="bus-assistant">
            <Input id="bus-assistant" name="assistantName" />
          </Field>
        </div>

        <Field label="Assistant's phone" htmlFor="bus-assistant-phone">
          <Input id="bus-assistant-phone" name="assistantPhone" inputMode="tel" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Roadworthy expires" htmlFor="bus-roadworthy">
            <Input id="bus-roadworthy" name="roadworthyExpiry" type="date" />
          </Field>
          <Field label="Insurance expires" htmlFor="bus-insurance">
            <Input id="bus-insurance" name="insuranceExpiry" type="date" />
          </Field>
        </div>

        <Submit icon={<Bus className="size-4" />} label="Add bus" busy="Saving…" />
      </CardBody>
    </form>
  );
}

function Submit({
  icon,
  label,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  busy: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {icon}
      {pending ? busy : label}
    </Button>
  );
}
