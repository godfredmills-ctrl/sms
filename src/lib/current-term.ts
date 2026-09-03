import "server-only";

import { db } from "@/lib/db";

/**
 * The year and term the school is in, and the filter that scopes to them.
 *
 * A subject offering exists once per term. A timetable slot does not: it
 * belongs to a class section and a time, and nothing else. Every screen that
 * puts those two together therefore has to say which term it means, and the
 * three that first did not each showed every subject once per term. A school
 * with three terms saw each of its subjects three times, was told two thirds of
 * them had no time set, and would have had the generator asked for three times
 * the work.
 *
 * One function, because that mistake was made three times in an afternoon by
 * one person who knew about it.
 */
export type CurrentTerm = {
  academicYearId: string | null;
  yearName: string | null;
  termId: string | null;
  termName: string | null;
};

export async function currentTerm(): Promise<CurrentTerm> {
  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  if (!year) {
    return { academicYearId: null, yearName: null, termId: null, termName: null };
  }

  // The term marked current, or the first of the year. A school that has not
  // marked one still gets a timetable rather than an empty screen.
  const term =
    (await db.term.findFirst({
      where: { academicYearId: year.id, isCurrent: true },
      select: { id: true, name: true },
    })) ??
    (await db.term.findFirst({
      where: { academicYearId: year.id },
      orderBy: { sequence: "asc" },
      select: { id: true, name: true },
    }));

  return {
    academicYearId: year.id,
    yearName: year.name,
    termId: term?.id ?? null,
    termName: term?.name ?? null,
  };
}

/**
 * A `where` fragment selecting this term's offerings.
 *
 * An offering with no term applies all year, so it is always included. Spread
 * into a query rather than returned as a whole where clause, because every
 * caller has its own other conditions.
 */
export function termFilter(term: CurrentTerm) {
  if (!term.academicYearId) return {};

  return {
    academicYearId: term.academicYearId,
    ...(term.termId ? { OR: [{ termId: term.termId }, { termId: null }] } : {}),
  };
}
