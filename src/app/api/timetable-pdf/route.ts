import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { AuthError, authorize, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDocumentImage } from "@/lib/document-images";
import { taughtBy } from "@/lib/scope";
import {
  renderTimetablePdf,
  type TimetableCell,
  type TimetableRow,
} from "@/lib/timetable-pdf";
import { fullName } from "@/lib/utils";

/**
 * A timetable as a printable landscape A4 sheet.
 *
 *   ?kind=class&sectionId=…   the class's week — subject, teacher, room
 *   ?kind=mine                the signed-in staff member's own week
 *   ?kind=teacher&staffId=…   any teacher's week, for whoever runs the timetable
 *
 * "mine" needs nothing beyond being staff — it is the viewer's own diary,
 * scoped by the session. The other two need academic.timetable.read, the
 * same permission that shows those grids on screen: a printout is a read.
 */
export const dynamic = "force-dynamic";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${title}</h1><p style="color:#555;line-height:1.5">${body}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  let user;
  if (kind === "mine") {
    user = await requireUser();
    if (!user.staffId) {
      return message(403, "No staff record", "Your account is not linked to a staff record.");
    }
  } else {
    try {
      user = await authorize("academic.timetable.read");
    } catch (error) {
      // An expired session goes to the login page like everywhere else in
      // the app; the bare refusal page is only for real permission gaps.
      if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
        redirect("/login");
      }
      return message(403, "Not allowed", (error as Error).message);
    }
  }

  const [school, year] = await Promise.all([
    db.school.findFirst({
      select: { name: true, logoUrl: true, crestUrl: true, branding: true },
    }),
    db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { name: true, terms: { where: { isCurrent: true }, take: 1, select: { name: true } } },
    }),
  ]);
  if (!school) {
    return message(400, "No school profile", "Set up the school profile under Settings first.");
  }

  const crest = await loadDocumentImage(school.crestUrl ?? school.logoUrl);
  const brandHex = (school.branding as { primary?: string } | null)?.primary ?? "#2C66CE";
  const subtitle = year
    ? `Timetable · ${year.name}${year.terms[0] ? `, ${year.terms[0].name}` : ""}`
    : "Timetable";

  let title: string;
  let rows: TimetableRow[];
  let filename: string;

  if (kind === "class") {
    const sectionId = url.searchParams.get("sectionId") ?? "";
    const section = await db.classSection.findUnique({
      where: { id: sectionId },
      select: { name: true, classLevel: { select: { name: true } } },
    });
    if (!section) return message(404, "Class not found", "Choose a class first.");

    const slots = await db.timetableSlot.findMany({
      where: { classSectionId: sectionId },
      orderBy: [{ periodIndex: "asc" }, { dayOfWeek: "asc" }],
      select: {
        dayOfWeek: true,
        periodIndex: true,
        startTime: true,
        endTime: true,
        room: true,
        label: true,
        isBreak: true,
        offering: {
          select: {
            room: true,
            subject: { select: { name: true, colour: true } },
            teacher: { select: { title: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!slots.length) {
      return message(404, "No timetable", "This class has no timetable to print yet.");
    }

    // A class's rows are its period numbers. The row is labelled with the
    // MAJORITY times for that period, and any day running different times —
    // a shortened Friday is the ordinary case — prints its own times in the
    // cell: a wall timetable showing the wrong bell time is worse than none.
    // A break collapses to the full-width band only when every day actually
    // has it; a Monday-only assembly stays in Monday's column.
    const periods = [...new Set(slots.map((slot) => slot.periodIndex))].sort(
      (a, b) => a - b,
    );
    rows = periods.map((periodIndex) => {
      const periodSlots = slots.filter((slot) => slot.periodIndex === periodIndex);

      const timeCounts = new Map<string, number>();
      for (const slot of periodSlots) {
        const key = `${slot.startTime}–${slot.endTime}`;
        timeCounts.set(key, (timeCounts.get(key) ?? 0) + 1);
      }
      const rowTime = [...timeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

      const allBreaks =
        periodSlots.length === DAY_NAMES.length &&
        periodSlots.every((slot) => slot.isBreak);

      if (allBreaks) {
        return {
          label: rowTime,
          breakLabel: periodSlots[0].label ?? "Break",
          cells: DAY_NAMES.map(() => null),
        };
      }

      const cells: Array<TimetableCell | null> = DAY_NAMES.map((_, index) => {
        const slot = periodSlots.find((entry) => entry.dayOfWeek === index + 1);
        if (!slot) return null;
        const ownTime = `${slot.startTime}–${slot.endTime}`;
        const timeNote = ownTime !== rowTime ? ownTime : null;
        if (slot.isBreak) {
          return { title: slot.label ?? "Break", line2: timeNote };
        }
        const room = slot.room ?? slot.offering?.room ?? null;
        return {
          title: slot.label ?? slot.offering?.subject.name ?? "—",
          line2: slot.offering?.teacher ? fullName(slot.offering.teacher) : null,
          line3: [timeNote, room].filter(Boolean).join(" · ") || null,
          colour: slot.offering?.subject.colour ?? null,
        };
      });

      return {
        label: `Period ${periodIndex}`,
        sublabel: rowTime,
        cells,
      };
    });

    title = `${section.classLevel.name} ${section.name}`;
    filename = `timetable-${section.classLevel.name}-${section.name}`.replace(
      /[^A-Za-z0-9._-]+/g,
      "-",
    );
  } else if (kind === "mine" || kind === "teacher") {
    let staffId: string;
    let staffName: string;

    if (kind === "mine") {
      staffId = user.staffId!;
      staffName = user.fullName;
    } else {
      const requested = url.searchParams.get("staffId") ?? "";
      const staff = await db.staff.findUnique({
        where: { id: requested },
        select: { title: true, firstName: true, lastName: true },
      });
      if (!staff) return message(404, "Teacher not found", "Choose a teacher first.");
      staffId = requested;
      staffName = fullName(staff);
    }

    const slots = await db.timetableSlot.findMany({
      where: { offering: taughtBy(staffId) },
      orderBy: [{ startTime: "asc" }, { dayOfWeek: "asc" }],
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        room: true,
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        offering: {
          select: { room: true, subject: { select: { name: true, colour: true } } },
        },
      },
    });
    if (!slots.length) {
      return message(404, "No lessons", "There are no lessons on this teacher's timetable.");
    }

    // A teacher's rows are keyed by the clock: their day spans classes whose
    // period numbers mean different things. Clashes are found by MINUTE
    // overlap, not by identical range strings — the realistic double booking
    // is 08:10–08:50 against 08:30–09:10, which never share a key.
    const minutes = (time: string): number | null => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(time);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const clashing = new Set<(typeof slots)[number]>();
    for (let a = 0; a < slots.length; a += 1) {
      for (let b = a + 1; b < slots.length; b += 1) {
        const one = slots[a];
        const two = slots[b];
        if (one.dayOfWeek !== two.dayOfWeek) continue;
        const oneStart = minutes(one.startTime);
        const oneEnd = minutes(one.endTime);
        const twoStart = minutes(two.startTime);
        const twoEnd = minutes(two.endTime);
        if (oneStart === null || oneEnd === null || twoStart === null || twoEnd === null)
          continue;
        if (oneStart < twoEnd && twoStart < oneEnd) {
          clashing.add(one);
          clashing.add(two);
        }
      }
    }
    const times = [...new Set(slots.map((slot) => `${slot.startTime}–${slot.endTime}`))].sort();
    rows = times.map((time) => {
      const [startTime] = time.split("–");
      const cells: Array<TimetableCell | null> = DAY_NAMES.map((_, index) => {
        const matches = slots.filter(
          (slot) =>
            slot.dayOfWeek === index + 1 && `${slot.startTime}–${slot.endTime}` === time,
        );
        if (!matches.length) return null;
        const first = matches[0];
        return {
          title: matches
            .map((slot) => `${slot.classSection.classLevel.name} ${slot.classSection.name}`)
            .join(" / "),
          line2: first.offering?.subject.name ?? null,
          line3: first.room ?? first.offering?.room ?? null,
          colour: matches.some((slot) => clashing.has(slot))
            ? "#dc2626"
            : (first.offering?.subject.colour ?? null),
        };
      });
      return { label: startTime, sublabel: time, cells };
    });

    title = staffName;
    filename = kind === "mine" ? "my-timetable" : "teacher-timetable";
  } else {
    return message(400, "Unknown request", "Choose a class or a teacher timetable.");
  }

  const pdf = await renderTimetablePdf({
    school: { name: school.name },
    crest,
    brandHex,
    title,
    subtitle,
    days: DAY_NAMES,
    rows,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "timetable.print",
      entity: "TimetableSlot",
      summary: `Printed ${kind} timetable: ${title}`,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
