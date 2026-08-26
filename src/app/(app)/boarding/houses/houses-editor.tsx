"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { BedDouble, Pencil, Plus, UserPlus, X } from "lucide-react";

import { SearchableSelect, type SelectOption } from "@/components/select-search";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxField,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { BOARDING_GENDERS, roomTone } from "@/lib/boarding-rules";

import {
  allocateBedAction,
  endAllocationAction,
  saveHouseAction,
  saveRoomAction,
  type BoardingState,
} from "../actions";

export type RoomRow = {
  id: string;
  name: string;
  capacity: number;
  occupied: number;
  floor: string | null;
  notes: string | null;
  active: boolean;
  boarders: Array<{ id: string; name: string; bedLabel: string | null }>;
};

export type HouseRow = {
  id: string;
  name: string;
  code: string | null;
  gender: string;
  houseParentId: string | null;
  houseParentName: string | null;
  assistantId: string | null;
  colour: string | null;
  motto: string | null;
  notes: string | null;
  active: boolean;
  rooms: RoomRow[];
};

/**
 * Houses, their rooms, and who is in each bed.
 *
 * The beds are the point. Boarding used to be four free-text fields on a
 * pupil, which can say a child is in Room 14 of a house that does not exist
 * and say it of thirty children about a room that sleeps eight — because
 * nothing counted. Every room here carries its count against its capacity.
 */
export function HousesEditor({
  houses,
  staff,
  unplaced,
}: {
  houses: HouseRow[];
  staff: SelectOption[];
  /** Boarders with no bed, offered for allocation. */
  unplaced: SelectOption[];
}) {
  const [editingHouse, setEditingHouse] = useState<HouseRow | "new" | null>(null);
  const [editingRoom, setEditingRoom] = useState<{ houseId: string; room?: RoomRow } | null>(
    null,
  );
  const [filling, setFilling] = useState<RoomRow | null>(null);

  return (
    <div className="space-y-5">
      {!editingHouse ? (
        <Button size="sm" onClick={() => setEditingHouse("new")}>
          <Plus className="size-4" />
          Add a house
        </Button>
      ) : (
        <HouseForm
          row={editingHouse === "new" ? undefined : editingHouse}
          staff={staff}
          onDone={() => setEditingHouse(null)}
        />
      )}

      {houses.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)]">
          No houses yet. A house is the pastoral unit a boarder belongs to; its rooms are
          the beds.
        </p>
      ) : (
        houses.map((house) => (
          <Card key={house.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {house.name}
                  {house.code ? <Badge tone="neutral">{house.code}</Badge> : null}
                  {house.active ? null : <Badge tone="neutral">Not in use</Badge>}
                </span>
              }
              description={[
                house.gender === "MIXED" ? "Mixed" : `${house.gender === "BOYS" ? "Boys" : "Girls"} only`,
                house.houseParentName ? `House parent: ${house.houseParentName}` : "No house parent",
                house.motto,
              ]
                .filter(Boolean)
                .join("  ·  ")}
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditingRoom({ houseId: house.id })}
                  >
                    <Plus className="size-4" />
                    Room
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingHouse(house)}
                    aria-label={`Edit ${house.name}`}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              }
            />
            <CardBody className="space-y-3">
              {editingRoom?.houseId === house.id ? (
                <RoomForm
                  houseId={house.id}
                  row={editingRoom.room}
                  onDone={() => setEditingRoom(null)}
                />
              ) : null}

              {house.rooms.length === 0 ? (
                <p className="text-sm text-[var(--text-subtle)]">
                  No rooms yet, so nobody can be allocated here.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {house.rooms.map((room) => (
                    <li key={room.id} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm text-[var(--text)]">
                            {room.name}
                            <Badge tone={roomTone(room.capacity, room.occupied)}>
                              {room.occupied}/{room.capacity}
                            </Badge>
                            {room.active ? null : (
                              <Badge tone="neutral">Not in use</Badge>
                            )}
                          </p>
                          {room.boarders.length ? (
                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                              {room.boarders
                                .map((b) => (b.bedLabel ? `${b.name} (${b.bedLabel})` : b.name))
                                .join(" · ")}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-[var(--text-subtle)]">Empty.</p>
                          )}
                        </div>

                        <div className="flex shrink-0 gap-1">
                          {room.active && room.occupied < room.capacity ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setFilling(room)}
                            >
                              <UserPlus className="size-4" />
                              Allocate
                            </Button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setEditingRoom({ houseId: house.id, room })}
                            aria-label={`Edit ${room.name}`}
                            className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                          >
                            <Pencil className="size-4" />
                          </button>
                        </div>
                      </div>

                      {filling?.id === room.id ? (
                        <Allocate
                          room={room}
                          unplaced={unplaced}
                          onDone={() => setFilling(null)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function Allocate({
  room,
  unplaced,
  onDone,
}: {
  room: RoomRow;
  unplaced: SelectOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [bedLabel, setBedLabel] = useState("");

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      {problem ? <Alert tone="danger">{problem}</Alert> : null}

      <p className="text-xs text-[var(--text-subtle)]">
        <BedDouble className="mr-1 inline size-3" />
        {room.capacity - room.occupied} bed
        {room.capacity - room.occupied === 1 ? "" : "s"} free in {room.name}.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Boarder" htmlFor={`alloc-${room.id}`}>
          <SearchableSelect
            id={`alloc-${room.id}`}
            name="studentId"
            options={unplaced}
            value={studentId}
            onChange={(next) => setStudentId(String(next))}
            placeholder="Search boarders without a bed"
          />
        </Field>
        <Field label="Bed" htmlFor={`bed-${room.id}`} hint="Optional: &ldquo;Bed 3&rdquo;, &ldquo;top bunk&rdquo;.">
          <Input
            id={`bed-${room.id}`}
            value={bedLabel}
            onChange={(event) => setBedLabel(event.target.value)}
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || !studentId}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            const data = new FormData();
            data.append("studentId", studentId);
            data.append("roomId", room.id);
            if (bedLabel.trim()) data.append("bedLabel", bedLabel.trim());
            const result = await allocateBedAction(data);
            setBusy(false);
            if (result.error) setProblem(result.error);
            else {
              onDone();
              router.refresh();
            }
          }}
        >
          {busy ? "Allocating…" : "Allocate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {room.boarders.length ? (
        <div className="border-t border-[var(--border)] pt-2">
          <p className="mb-1 text-xs text-[var(--text-subtle)]">In this room now:</p>
          <ul className="space-y-1">
            {room.boarders.map((boarder) => (
              <li key={boarder.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{boarder.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-[var(--danger)] hover:underline"
                  onClick={async () => {
                    setBusy(true);
                    setProblem(null);
                    const data = new FormData();
                    data.append("studentId", boarder.id);
                    const result = await endAllocationAction(data);
                    setBusy(false);
                    if (result.error) setProblem(result.error);
                    else router.refresh();
                  }}
                >
                  Release the bed
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function HouseForm({
  row,
  staff,
  onDone,
}: {
  row?: HouseRow;
  staff: SelectOption[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<BoardingState, FormData>(saveHouseAction, {});

  return (
    <Card>
      <CardHeader
        title={row ? `Edit ${row.name}` : "New house"}
        action={
          <Button size="sm" variant="ghost" onClick={onDone}>
            <X className="size-4" />
          </Button>
        }
      />
      <CardBody>
        <form action={action} className="space-y-3">
          {row ? <input type="hidden" name="id" value={row.id} /> : null}
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="h-name" required>
              <Input id="h-name" name="name" required defaultValue={row?.name} />
            </Field>
            <Field label="Short code" htmlFor="h-code" hint="Printed on a house list.">
              <Input id="h-code" name="code" defaultValue={row?.code ?? ""} placeholder="RH" />
            </Field>
            <Field label="Takes" htmlFor="h-gender">
              <Select id="h-gender" name="gender" defaultValue={row?.gender ?? "MIXED"}>
                {BOARDING_GENDERS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="House parent"
              htmlFor="h-parent"
              hint="Sleeps on the compound, and is called at night."
            >
              <SearchableSelect
                id="h-parent"
                name="houseParentId"
                options={staff}
                defaultValue={row?.houseParentId || undefined}
                placeholder="Nobody yet"
              />
            </Field>
            <Field label="Assistant" htmlFor="h-assistant">
              <SearchableSelect
                id="h-assistant"
                name="assistantId"
                options={staff}
                defaultValue={row?.assistantId || undefined}
                placeholder="Nobody yet"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Motto" htmlFor="h-motto">
              <Input id="h-motto" name="motto" defaultValue={row?.motto ?? ""} />
            </Field>
            <Field label="Colour" htmlFor="h-colour">
              <Input id="h-colour" name="colour" defaultValue={row?.colour ?? ""} placeholder="Green" />
            </Field>
          </div>

          <Field label="Notes" htmlFor="h-notes">
            <Textarea id="h-notes" name="notes" rows={2} defaultValue={row?.notes ?? ""} />
          </Field>

          <CheckboxField
            name="active"
            label="In use"
            description="Off keeps it out of the allocation pickers. Its boarders stay where they are."
            defaultChecked={row?.active ?? true}
          />

          <SaveButton label={row ? "Save" : "Add the house"} />
        </form>
      </CardBody>
    </Card>
  );
}

function RoomForm({
  houseId,
  row,
  onDone,
}: {
  houseId: string;
  row?: RoomRow;
  onDone: () => void;
}) {
  const [state, action] = useActionState<BoardingState, FormData>(saveRoomAction, {});

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <input type="hidden" name="houseId" value={houseId} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text)]">
          {row ? `Edit ${row.name}` : "New room"}
        </p>
        <button type="button" onClick={onDone} aria-label="Close">
          <X className="size-4 text-[var(--text-muted)]" />
        </button>
      </div>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor="r-name" required>
          <Input id="r-name" name="name" required defaultValue={row?.name} placeholder="Dorm 3" />
        </Field>
        <Field
          label="Beds"
          htmlFor="r-capacity"
          required
          hint="Beds, not floor space."
        >
          <Input
            id="r-capacity"
            name="capacity"
            inputMode="numeric"
            required
            defaultValue={row ? String(row.capacity) : ""}
          />
        </Field>
        <Field label="Floor" htmlFor="r-floor">
          <Input id="r-floor" name="floor" defaultValue={row?.floor ?? ""} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="r-notes">
        <Textarea id="r-notes" name="notes" rows={2} defaultValue={row?.notes ?? ""} />
      </Field>

      <CheckboxField
        name="active"
        label="In use"
        description="Off keeps it out of the allocation pickers."
        defaultChecked={row?.active ?? true}
      />

      <SaveButton label={row ? "Save" : "Add the room"} />
    </form>
  );
}

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
