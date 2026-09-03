/**
 * Timetable arithmetic: clashes, load, and building one.
 *
 * Pure, and that is the point of the file existing. The clash check used to
 * live inside the timetable page, which meant the page could colour a cell red
 * and the action that wrote the cell knew nothing about it. The proposal said
 * the builder "refuses to double book a teacher" and the builder did not
 * refuse; it complained afterwards. One module, used by the screen that draws
 * the grid and by the action that writes to it, is what makes the sentence
 * true.
 *
 * Everything here compares the clock and never the period number. periodIndex
 * counts within one class's own day, and two classes need not ring the same
 * bells: JHS 1 period 2 can sit across JHS 2 period 3 while never sharing an
 * index. Matching numbers announces clashes that are not and stays silent on
 * the ones that are.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** "08:10" as minutes past midnight, or null if it is not a time. */
export function minutesOf(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export type Span = { startTime: string; endTime: string };

/**
 * Whether two spans share any minute.
 *
 * Touching is not overlapping: a period ending at 08:10 and the next starting
 * at 08:10 are back to back, which is the normal shape of a school day and
 * must not read as a clash.
 *
 * An unparseable time is not evidence of a clash. A row with a broken time is
 * a data problem worth reporting on its own, and treating it as a conflict
 * would bury every real one under it.
 */
export function overlaps(a: Span, b: Span): boolean {
  const aStart = minutesOf(a.startTime);
  const aEnd = minutesOf(a.endTime);
  const bStart = minutesOf(b.startTime);
  const bEnd = minutesOf(b.endTime);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** Whether one span runs straight into the next, in order. */
export function adjacent(first: Span, second: Span): boolean {
  const end = minutesOf(first.endTime);
  const start = minutesOf(second.startTime);
  return end !== null && start !== null && end === start;
}

// ---------------------------------------------------------------------------
// The bell schedule
// ---------------------------------------------------------------------------

export type Period = {
  periodIndex: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  label?: string | null;
};

/**
 * The default day, used only when a school has not set its own.
 *
 * It matches the rows the migration seeds. Two copies of the same schedule is
 * a thing this codebase has been bitten by, so the reason for the duplication
 * is worth stating: SQL cannot import TypeScript, and a migration that reads
 * application code is a migration whose result changes when the code does,
 * which is the one thing a migration must never do.
 */
export const DEFAULT_PERIODS: Period[] = [
  { periodIndex: 1, startTime: "07:30", endTime: "08:10", isBreak: false },
  { periodIndex: 2, startTime: "08:10", endTime: "08:50", isBreak: false },
  { periodIndex: 3, startTime: "08:50", endTime: "09:30", isBreak: false },
  { periodIndex: 4, startTime: "09:30", endTime: "10:10", isBreak: false },
  { periodIndex: 5, startTime: "10:10", endTime: "10:40", isBreak: true, label: "Break" },
  { periodIndex: 6, startTime: "10:40", endTime: "11:20", isBreak: false },
  { periodIndex: 7, startTime: "11:20", endTime: "12:00", isBreak: false },
  { periodIndex: 8, startTime: "12:00", endTime: "12:40", isBreak: false },
  { periodIndex: 9, startTime: "12:40", endTime: "13:20", isBreak: true, label: "Lunch" },
  { periodIndex: 10, startTime: "13:20", endTime: "14:00", isBreak: false },
  { periodIndex: 11, startTime: "14:00", endTime: "14:40", isBreak: false },
];

export const DAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const;

export function dayLabel(value: number): string {
  return DAYS.find((day) => day.value === value)?.label ?? "";
}

/** The periods anything can actually be taught in. */
export function teachable(periods: Period[]): Period[] {
  return periods.filter((period) => !period.isBreak);
}

/**
 * Problems with the bell schedule itself.
 *
 * Checked because everything downstream trusts it. A period whose times do not
 * parse silently stops clashing with anything, and one that overlaps its
 * neighbour makes every class in the school double-booked against itself.
 */
export function periodProblems(periods: Period[]): string[] {
  const problems: string[] = [];
  const sorted = [...periods].sort((a, b) => a.periodIndex - b.periodIndex);

  const seen = new Set<number>();
  for (const period of sorted) {
    const label = `Period ${period.periodIndex}`;

    if (seen.has(period.periodIndex)) problems.push(`${label} is listed twice.`);
    seen.add(period.periodIndex);

    const start = minutesOf(period.startTime);
    const end = minutesOf(period.endTime);

    if (start === null) problems.push(`${label} has no readable start time.`);
    if (end === null) problems.push(`${label} has no readable end time.`);
    if (start !== null && end !== null && end <= start) {
      problems.push(`${label} ends before it starts.`);
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    if (overlaps(sorted[index - 1], sorted[index])) {
      problems.push(
        `Period ${sorted[index - 1].periodIndex} and period ${sorted[index].periodIndex} overlap.`,
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Clashes
// ---------------------------------------------------------------------------

export type Placement = {
  /** Absent while a placement is only being considered. */
  id?: string;
  classSectionId: string;
  dayOfWeek: number;
  periodIndex: number;
  startTime: string;
  endTime: string;
  offeringId: string | null;
  /** Everyone standing in the room: the teacher and any co-teachers. */
  staffIds: string[];
  room?: string | null;
};

export type Clash = {
  kind: "teacher" | "room" | "class";
  /** The placement already there. */
  with: Placement;
  /** The member of staff or the room, for a sentence somebody can read. */
  subject?: string;
};

/**
 * The first reason this placement cannot go where it is being put.
 *
 * Ordered by what a person would want told first. A teacher in two rooms at
 * once is a person who cannot be in both; a class in two lessons at once is
 * thirty people who cannot be; a room booked twice is furniture. All three are
 * wrong and only one of them ends with somebody standing in a corridor.
 */
export function findClash(existing: Placement[], candidate: Placement): Clash | null {
  const staff = new Set(candidate.staffIds.filter(Boolean));
  const room = (candidate.room ?? "").trim().toLowerCase();

  /*
   * The row being replaced is not something to clash with.
   *
   * Both ids have to exist for that to mean anything. Written as
   * `other.id !== candidate.id` it also excused every pair where neither had
   * one, because undefined is not unequal to undefined, and a placement being
   * considered has no id yet. The generator therefore compared each candidate
   * against nothing at all and cheerfully put forty periods into a nine period
   * day, with every clash check downstream agreeing it was fine.
   */
  const sameRow = (other: Placement) =>
    candidate.id !== undefined && other.id === candidate.id;

  const sameTime = existing.filter(
    (other) =>
      !sameRow(other) &&
      other.dayOfWeek === candidate.dayOfWeek &&
      overlaps(other, candidate),
  );

  for (const other of sameTime) {
    const shared = other.staffIds.find((id) => id && staff.has(id));
    if (shared) return { kind: "teacher", with: other, subject: shared };
  }

  for (const other of sameTime) {
    // A class cannot be in two lessons at once. Its own other slot at the same
    // time is the clash, and replacing a slot is not one: the candidate
    // carries the id of the row it is replacing.
    if (other.classSectionId === candidate.classSectionId) {
      return { kind: "class", with: other };
    }
  }

  if (room) {
    for (const other of sameTime) {
      if ((other.room ?? "").trim().toLowerCase() === room) {
        return { kind: "room", with: other, subject: candidate.room ?? undefined };
      }
    }
  }

  return null;
}

/** Every placement that clashes with something else, keyed by its id. */
export function allClashes(placements: Placement[]): Map<string, Clash> {
  const found = new Map<string, Clash>();

  for (const placement of placements) {
    if (!placement.id || !placement.offeringId) continue;
    const clash = findClash(placements, placement);
    if (clash) found.set(placement.id, clash);
  }

  return found;
}

// ---------------------------------------------------------------------------
// Load and shape
// ---------------------------------------------------------------------------

/** Periods a week, per member of staff. */
export function teacherLoad(placements: Placement[]): Map<string, number> {
  const load = new Map<string, number>();

  for (const placement of placements) {
    if (!placement.offeringId) continue;
    for (const staffId of new Set(placement.staffIds.filter(Boolean))) {
      load.set(staffId, (load.get(staffId) ?? 0) + 1);
    }
  }

  return load;
}

/** How many periods of one offering fall on each day. */
export function perDay(placements: Placement[], offeringId: string): Map<number, number> {
  const counts = new Map<number, number>();

  for (const placement of placements) {
    if (placement.offeringId !== offeringId) continue;
    counts.set(placement.dayOfWeek, (counts.get(placement.dayOfWeek) ?? 0) + 1);
  }

  return counts;
}

export type Demand = {
  offeringId: string;
  classSectionId: string;
  staffIds: string[];
  periodsPerWeek: number;
  doublePeriods: number;
  room?: string | null;
  /** For the report, so an unplaced subject can be named. */
  label?: string;
};

export type Shortfall = {
  offeringId: string;
  label: string;
  wanted: number;
  placed: number;
};

export type Pressure = {
  staffId: string;
  /** Periods a week this person is being asked to teach. */
  wanted: number;
  /** Periods a week they could teach, after their time off. */
  capacity: number;
  /** Over capacity, so no arrangement of the week can satisfy them. */
  impossible: boolean;
};

/**
 * Who is being asked for more than a week holds.
 *
 * The most useful thing this module can tell a school, and the thing a
 * generator alone cannot. A timetable that comes back half filled looks like
 * the software failing, and nine times in ten it is a school with six teachers
 * and twenty-one classes: the busiest teacher is wanted for a hundred and
 * fifteen periods in a week that has forty-five, and no arrangement of
 * anything fixes that. Saying so by name is the difference between a tool
 * somebody trusts and one they stop using.
 */
export function teacherPressure(
  demands: Demand[],
  periods: Period[],
  days: number[],
  unavailable: Unavailable[] = [],
): Pressure[] {
  const teaching = teachable(periods);
  const wanted = new Map<string, number>();

  for (const demand of demands) {
    for (const staffId of new Set(demand.staffIds.filter(Boolean))) {
      wanted.set(staffId, (wanted.get(staffId) ?? 0) + demand.periodsPerWeek);
    }
  }

  return [...wanted.entries()]
    .map(([staffId, asked]) => {
      let capacity = 0;
      for (const day of days) {
        for (const period of teaching) {
          if (!isUnavailable(unavailable, [staffId], day, period.periodIndex)) {
            capacity += 1;
          }
        }
      }

      return {
        staffId,
        wanted: asked,
        capacity,
        impossible: asked > capacity,
      };
    })
    .sort((a, b) => b.wanted - a.wanted);
}

/**
 * The most periods that could ever be placed, whatever order they are tried in.
 *
 * Bounded by two things at once: what the classrooms hold, and what the staff
 * hold. Reported so a half-filled timetable can be compared against what was
 * actually achievable rather than against what was asked for.
 */
export function ceiling(
  demands: Demand[],
  periods: Period[],
  days: number[],
  unavailable: Unavailable[] = [],
): number {
  const teaching = teachable(periods).length * days.length;

  const sections = new Set(demands.map((demand) => demand.classSectionId));
  const byRoom = sections.size * teaching;

  const byStaff = teacherPressure(demands, periods, days, unavailable).reduce(
    (sum, entry) => sum + Math.min(entry.wanted, entry.capacity),
    0,
  );

  const asked = demands.reduce((sum, demand) => sum + demand.periodsPerWeek, 0);

  return Math.min(asked, byRoom, byStaff);
}

/** What each subject asked for against what it got. */
export function shortfalls(demands: Demand[], placements: Placement[]): Shortfall[] {
  const placed = new Map<string, number>();
  for (const placement of placements) {
    if (!placement.offeringId) continue;
    placed.set(placement.offeringId, (placed.get(placement.offeringId) ?? 0) + 1);
  }

  return demands
    .map((demand) => ({
      offeringId: demand.offeringId,
      label: demand.label ?? demand.offeringId,
      wanted: demand.periodsPerWeek,
      placed: placed.get(demand.offeringId) ?? 0,
    }))
    .filter((row) => row.placed < row.wanted);
}

// ---------------------------------------------------------------------------
// Unavailability
// ---------------------------------------------------------------------------

export type Unavailable = {
  staffId: string;
  dayOfWeek: number;
  /** Null is the whole day. */
  periodIndex: number | null;
};

export function isUnavailable(
  rules: Unavailable[],
  staffIds: string[],
  dayOfWeek: number,
  periodIndex: number,
): boolean {
  const staff = new Set(staffIds.filter(Boolean));

  return rules.some(
    (rule) =>
      staff.has(rule.staffId) &&
      rule.dayOfWeek === dayOfWeek &&
      (rule.periodIndex === null || rule.periodIndex === periodIndex),
  );
}

// ---------------------------------------------------------------------------
// Building one
// ---------------------------------------------------------------------------

/**
 * A small deterministic random source.
 *
 * The generator tries several arrangements and keeps the best, which needs
 * randomness to explore with. It must not need luck: run it twice on the same
 * data and it has to produce the same timetable, or nobody can tell whether a
 * change they made improved anything.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type GenerateInput = {
  demands: Demand[];
  periods: Period[];
  days: number[];
  unavailable: Unavailable[];
  /** Slots already on the timetable, which are respected and never moved. */
  fixed?: Placement[];
  /** More attempts explore more arrangements. Deterministic either way. */
  attempts?: number;
  seed?: number;
};

export type GenerateResult = {
  placements: Placement[];
  shortfalls: Shortfall[];
  /** How many of the requested periods were placed. */
  placed: number;
  wanted: number;
  attemptsUsed: number;
};

/**
 * A unit of teaching to place: one period, or a pair that cannot be split.
 */
type Unit = { demand: Demand; length: 1 | 2 };

function unitsFor(demand: Demand): Unit[] {
  const units: Unit[] = [];

  // Doubles are counted in periods, so two doubles is four periods in two
  // pairs. The database refuses an odd number, and this halves what is left
  // rather than trusting that.
  const pairs = Math.floor(Math.min(demand.doublePeriods, demand.periodsPerWeek) / 2);
  for (let index = 0; index < pairs; index += 1) units.push({ demand, length: 2 });

  const singles = demand.periodsPerWeek - pairs * 2;
  for (let index = 0; index < singles; index += 1) units.push({ demand, length: 1 });

  return units;
}

/**
 * How good a place this is, lower being better. Null means it will not go.
 *
 * The hard rules come first and return null: a clash, an unavailable teacher,
 * a break, a day that does not exist. What is left is preference, and the
 * preferences are the difference between a timetable that is legal and one a
 * school would actually use.
 */
function cost(
  unit: Unit,
  day: number,
  slice: Period[],
  placements: Placement[],
  unavailable: Unavailable[],
): number | null {
  const { demand } = unit;

  for (const period of slice) {
    if (period.isBreak) return null;
    if (isUnavailable(unavailable, demand.staffIds, day, period.periodIndex)) return null;

    const candidate: Placement = {
      classSectionId: demand.classSectionId,
      dayOfWeek: day,
      periodIndex: period.periodIndex,
      startTime: period.startTime,
      endTime: period.endTime,
      offeringId: demand.offeringId,
      staffIds: demand.staffIds,
      room: demand.room ?? null,
    };

    if (findClash(placements, candidate)) return null;
  }

  let score = 0;

  // Spread across the week. A class with five periods of Mathematics wants one
  // a day, not three on Tuesday, and this is the term that produces that.
  const already = perDay(placements, demand.offeringId).get(day) ?? 0;
  score += already * 40;

  // Not immediately before or after itself, unless it is meant to be a pair.
  const touching = placements.some(
    (placement) =>
      placement.offeringId === demand.offeringId &&
      placement.dayOfWeek === day &&
      slice.some(
        (period) => adjacent(placement, period) || adjacent(period, placement),
      ),
  );
  if (touching && unit.length === 1) score += 25;

  // The class's own day should fill from the front. A timetable with a hole in
  // the middle of Tuesday morning and a lesson at the end of the afternoon is
  // legal and nobody wants it.
  const first = slice[0];
  score += first.periodIndex * 2;

  // A double sits better in the morning, where practicals actually happen.
  if (unit.length === 2) score += first.periodIndex * 3;

  return score;
}

/**
 * Builds a timetable.
 *
 * Greedy, most-constrained-first, repeated with different orderings and the
 * best kept. Not an exact solver: school timetabling is NP-hard and an exact
 * answer for a school of twenty classes is not something to wait for on a web
 * request. What this does instead is the thing a human timetabler does, faster
 * and without forgetting anybody, and it reports honestly what it could not
 * place rather than quietly dropping it.
 *
 * Existing slots are respected and never moved. A school that has hand-built
 * Monday and wants the rest filled in gets exactly that.
 */
export function generateTimetable(input: GenerateInput): GenerateResult {
  const {
    demands,
    periods,
    days,
    unavailable,
    fixed = [],
    attempts = 12,
    seed = 20260903,
  } = input;

  const usable = [...periods].sort((a, b) => a.periodIndex - b.periodIndex);
  const wanted = demands.reduce((sum, demand) => sum + demand.periodsPerWeek, 0);

  // How busy each teacher is across the whole school. The hardest subjects to
  // place are the ones whose teacher has the least room left, so they go
  // first: leaving them until last is how a generator ends up with four
  // unplaceable periods and no way back.
  const pressure = new Map<string, number>();
  for (const demand of demands) {
    for (const staffId of demand.staffIds) {
      pressure.set(staffId, (pressure.get(staffId) ?? 0) + demand.periodsPerWeek);
    }
  }

  const weight = (demand: Demand) =>
    Math.max(0, ...demand.staffIds.map((id) => pressure.get(id) ?? 0)) * 100 +
    demand.periodsPerWeek * 10 +
    demand.doublePeriods;

  let best: GenerateResult | null = null;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const random = seeded(seed + attempt * 7919);

    const units = demands
      .flatMap(unitsFor)
      // Doubles first: a pair needs two adjacent free periods, and by the time
      // the singles have been scattered there may be none left.
      .sort((a, b) => {
        if (a.length !== b.length) return b.length - a.length;
        const byWeight = weight(b.demand) - weight(a.demand);
        if (byWeight !== 0) return byWeight;
        // The jitter is what makes a second attempt different from the first.
        return random() - 0.5;
      });

    const placements: Placement[] = [...fixed];

    for (const unit of units) {
      let chosen: { day: number; slice: Period[]; score: number } | null = null;

      for (const day of days) {
        for (let index = 0; index + unit.length <= usable.length; index += 1) {
          const slice = usable.slice(index, index + unit.length);

          // A pair has to be genuinely back to back. Two periods with a break
          // between them are not a double lesson.
          if (unit.length === 2 && !adjacent(slice[0], slice[1])) continue;

          const score = cost(unit, day, slice, placements, unavailable);
          if (score === null) continue;

          // A tie goes to the first found, which keeps the result stable.
          if (!chosen || score < chosen.score) chosen = { day, slice, score };
        }
      }

      if (!chosen) continue;

      for (const period of chosen.slice) {
        placements.push({
          classSectionId: unit.demand.classSectionId,
          dayOfWeek: chosen.day,
          periodIndex: period.periodIndex,
          startTime: period.startTime,
          endTime: period.endTime,
          offeringId: unit.demand.offeringId,
          staffIds: unit.demand.staffIds,
          room: unit.demand.room ?? null,
        });
      }
    }

    const generated = placements.filter((placement) => !fixed.includes(placement));
    const result: GenerateResult = {
      placements: generated,
      shortfalls: shortfalls(demands, placements),
      placed: generated.length,
      wanted,
      attemptsUsed: attempt + 1,
    };

    if (!best || result.placed > best.placed) best = result;

    // Nothing left to improve on.
    if (best.placed >= wanted) break;
  }

  return (
    best ?? {
      placements: [],
      shortfalls: shortfalls(demands, fixed),
      placed: 0,
      wanted,
      attemptsUsed: 0,
    }
  );
}
