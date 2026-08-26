import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, DoorOpen, TriangleAlert, UserMinus } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { occupancy, unhoused, whoIsOut } from "@/lib/boarding";
import { isOverdue, roomTone } from "@/lib/boarding-rules";
import { formatDateTime, listName, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Boarding" };
export const dynamic = "force-dynamic";

export default async function BoardingPage() {
  const user = await requirePermission(["boarding.read", "boarding.manage", "boarding.gate"]);

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  if (!year) {
    return (
      <>
        <PageHeader title="Boarding" description="Houses, beds, and who is off the premises." />
        <Alert tone="warning" title="There is no current academic year">
          Beds are allocated for a year. Set one up under{" "}
          <Link href="/academics/years" className="underline">
            Academic years
          </Link>{" "}
          first.
        </Alert>
      </>
    );
  }

  const [rooms, out, waiting, boarders] = await Promise.all([
    occupancy(year.id),
    whoIsOut(),
    unhoused(year.id),
    db.student.count({ where: { status: "ENROLLED", isBoarder: true } }),
  ]);

  const now = new Date();
  const overdue = out.filter((exeat) => isOverdue({ status: "OUT", dueBackAt: exeat.dueBackAt }, now));
  // A room taken out of use keeps its boarders, so it keeps the beds they are
  // actually in. Dropping its whole capacity put the total below the number
  // filled — "54 / 48", "-6 spare" — with no over-full room to explain it,
  // because every room was exactly at capacity. Its empty beds are still not
  // offered: allocationRefusal will not put anybody in an inactive room.
  const beds = rooms.reduce(
    (sum, room) => sum + (room.active ? room.capacity : room.occupied),
    0,
  );
  const filled = rooms.reduce((sum, room) => sum + room.occupied, 0);
  const overFull = rooms.filter((room) => room.occupied > room.capacity);

  // Rooms folded back into their houses, which is how a house parent thinks.
  const houses = new Map<string, { name: string; gender: string; rooms: typeof rooms }>();
  for (const room of rooms) {
    const entry = houses.get(room.houseId);
    if (entry) entry.rooms.push(room);
    else houses.set(room.houseId, { name: room.houseName, gender: room.houseGender, rooms: [room] });
  }

  return (
    <>
      <PageHeader
        title="Boarding"
        description={`${year.name}. Beds, and who is off the premises: which is the half somebody asks about in a hurry.`}
        action={
          userCan(user, "boarding.gate") || userCan(user, "boarding.exeat.request") ? (
            <LinkButton href="/boarding/exeat" size="sm">
              <DoorOpen className="size-4" />
              The gate
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Off the premises"
          value={String(out.length)}
          hint={overdue.length ? `${overdue.length} overdue` : "All within their hours"}
          tone={overdue.length ? "danger" : out.length ? "info" : "neutral"}
          icon={<DoorOpen className="size-4" />}
        />
        <StatCard
          label="Beds filled"
          value={`${filled} / ${beds}`}
          hint={beds ? `${beds - filled} spare` : "No rooms set up yet"}
          tone={filled > beds ? "danger" : "neutral"}
          icon={<BedDouble className="size-4" />}
        />
        <StatCard
          label="Boarders without a bed"
          value={String(waiting.length)}
          hint={waiting.length ? "Marked as boarders, sleeping nowhere" : "Everyone is placed"}
          tone={waiting.length ? "warning" : "success"}
          icon={<UserMinus className="size-4" />}
        />
        <StatCard
          label="Boarders on the roll"
          value={String(boarders)}
          tone="neutral"
        />
      </div>

      {overdue.length ? (
        <Alert
          tone="danger"
          title={`${overdue.length} boarder${overdue.length === 1 ? " is" : "s are"} overdue`}
          className="mb-4"
        >
          <ul className="mt-1 space-y-1">
            {overdue.map((exeat) => (
              <li key={exeat.id}>
                <span className="font-medium">{listName(exeat.student)}</span>: due back{" "}
                {relativeTime(exeat.dueBackAt)}, with {exeat.releasedToName}
                {exeat.releasedToPhone ? ` (${exeat.releasedToPhone})` : ""}, at{" "}
                {exeat.destination}.
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {overFull.length ? (
        <Alert tone="warning" title="More boarders than beds" className="mb-4">
          {overFull
            .map((room) => `${room.houseName} ${room.roomName}: ${room.occupied} in ${room.capacity}`)
            .join(" · ")}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {houses.size === 0 ? (
            <Alert tone="info" title="No houses yet">
              A boarder without a house is four words in a text field. Set the houses and
              their rooms up under{" "}
              <Link href="/boarding/houses" className="underline">
                Houses &amp; rooms
              </Link>
              .
            </Alert>
          ) : (
            [...houses.entries()].map(([houseId, house]) => (
              <Card key={houseId}>
                <CardHeader
                  title={house.name}
                  description={`${house.rooms.reduce((sum, room) => sum + room.occupied, 0)} of ${house.rooms.reduce((sum, room) => sum + room.capacity, 0)} beds · ${
                    house.gender === "MIXED" ? "mixed" : house.gender.toLowerCase()
                  }`}
                />
                <CardBody>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {house.rooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[var(--text)]">
                            {room.roomName}
                          </p>
                          {room.active ? null : (
                            <p className="text-xs text-[var(--text-subtle)]">not in use</p>
                          )}
                        </div>
                        <Badge tone={roomTone(room.capacity, room.occupied)}>
                          {room.occupied}/{room.capacity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Off the premises"
              description="Signed out and not yet back."
            />
            <CardBody>
              {out.length === 0 ? (
                <p className="text-sm text-[var(--text-subtle)]">
                  Every boarder is on the compound.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {out.map((exeat) => {
                    const late = isOverdue(
                      { status: "OUT", dueBackAt: exeat.dueBackAt },
                      now,
                    );
                    return (
                      <li key={exeat.id} className="py-2">
                        <p className="flex items-center gap-2 text-sm text-[var(--text)]">
                          {listName(exeat.student)}
                          {late ? <Badge tone="danger">Overdue</Badge> : null}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {exeat.destination} · with {exeat.releasedToName} · due{" "}
                          {formatDateTime(exeat.dueBackAt)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {waiting.length ? (
            <Card>
              <CardHeader
                title="No bed yet"
                description="Marked as boarders with nowhere allocated."
              />
              <CardBody>
                <ul className="divide-y divide-[var(--border)]">
                  {waiting.slice(0, 25).map((student) => (
                    <li key={student.id} className="py-2">
                      <Link
                        href={`/students/${student.id}`}
                        className="text-sm text-[var(--text)] hover:text-[var(--primary)]"
                      >
                        {listName(student)}
                      </Link>
                      <p className="numeric text-xs text-[var(--text-subtle)]">
                        {student.admissionNo}
                        {student.enrollments[0]
                          ? ` · ${student.enrollments[0].classSection.classLevel.name} ${student.enrollments[0].classSection.name}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                {waiting.length > 25 ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    <TriangleAlert className="mr-1 inline size-3" />
                    {waiting.length - 25} more not shown.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
