import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, DoorOpen, Home, Users } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanise, listName } from "@/lib/utils";

export const metadata: Metadata = { title: "Boarding" };
export const dynamic = "force-dynamic";

/**
 * The boarding register.
 *
 * Student records have carried isBoarder, house, dormitory and room since the
 * schema was written, and the admission form collects them — but no page ever
 * read them together, so "who sleeps where tonight" meant filtering a
 * spreadsheet export. This is that question as a page: houses, dormitories,
 * rooms, and the boarders missing an assignment, who are the register's real
 * work.
 */
export default async function BoardingPage() {
  await requirePermission("student.read");

  const boarders = await db.student.findMany({
    where: { status: "ENROLLED", isBoarder: true },
    orderBy: [{ house: "asc" }, { dormitory: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      admissionNo: true,
      gender: true,
      house: true,
      dormitory: true,
      roomNumber: true,
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });

  const unassigned = boarders.filter((student) => !student.dormitory);
  const girls = boarders.filter((student) => student.gender === "FEMALE").length;
  const boys = boarders.filter((student) => student.gender === "MALE").length;

  // House → dormitory → students. A boarder without a house files under
  // "Unassigned", which keeps them visible instead of dropped.
  const houses = new Map<string, Map<string, typeof boarders>>();
  for (const student of boarders) {
    const house = student.house?.trim() || "Unassigned";
    const dormitory = student.dormitory?.trim() || "No dormitory";
    if (!houses.has(house)) houses.set(house, new Map());
    const dorms = houses.get(house)!;
    if (!dorms.has(dormitory)) dorms.set(dormitory, []);
    dorms.get(dormitory)!.push(student);
  }

  return (
    <>
      <PageHeader
        title="Boarding"
        description="Who sleeps where — houses, dormitories, rooms, and the boarders still waiting for a bed."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Boarders"
          value={boarders.length}
          tone="violet"
          icon={<BedDouble className="size-4" />}
        />
        <StatCard
          label="Girls / Boys"
          value={`${girls} / ${boys}`}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Houses"
          value={[...houses.keys()].filter((name) => name !== "Unassigned").length}
          tone="teal"
          icon={<Home className="size-4" />}
        />
        <StatCard
          label="No bed assigned"
          value={unassigned.length}
          tone={unassigned.length ? "warning" : "success"}
          icon={<DoorOpen className="size-4" />}
        />
      </div>

      {boarders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BedDouble className="size-5" />}
            title="No boarders"
            description="Mark students as boarders on their profile or at admission, and the register builds itself."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...houses.entries()].map(([house, dorms]) => {
            const houseCount = [...dorms.values()].reduce(
              (sum, students) => sum + students.length,
              0,
            );
            return (
              <Card key={house}>
                <CardHeader
                  title={house === "Unassigned" ? "No house assigned" : `${house} house`}
                  description={`${houseCount} boarder${houseCount === 1 ? "" : "s"}`}
                />
                <div className="divide-y divide-[var(--border)]">
                  {[...dorms.entries()].map(([dormitory, students]) => (
                    <div key={dormitory} className="px-5 py-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                        <DoorOpen className="size-3" />
                        {dormitory}
                        <span className="text-[var(--text-subtle)]">
                          · {students.length}
                        </span>
                      </p>
                      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {students.map((student) => {
                          const section = student.enrollments[0]?.classSection;
                          return (
                            <li
                              key={student.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Link
                                href={`/students/${student.id}`}
                                className="min-w-0 truncate font-medium hover:text-[var(--primary)]"
                              >
                                {listName(student)}
                              </Link>
                              <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                                {section
                                  ? `${section.classLevel.name} ${section.name}`
                                  : student.admissionNo}
                              </span>
                              {student.roomNumber ? (
                                <Badge tone="neutral">Rm {student.roomNumber}</Badge>
                              ) : (
                                <Badge tone="warning">No room</Badge>
                              )}
                              <span className="shrink-0 text-[10px] text-[var(--text-subtle)]">
                                {humanise(student.gender).slice(0, 1)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
