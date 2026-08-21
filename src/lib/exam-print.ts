import "server-only";

/**
 * The three sheets an examination is run from.
 *
 * All three are Markdown, laid out by renderDocumentPdf on the school's
 * letterhead — the same parser and the same renderer as a letter. That is
 * deliberate. Each of these is a table that has to break across pages without
 * losing a row, carry Ghanaian names without taking the render down, and be
 * recognisable as having come from this school. That renderer already does all
 * of it and has been read off the page doing it; a second renderer here would
 * be three more places for a cedi sign, a long subject name or a page break to
 * go wrong.
 *
 * What each is for:
 *
 *   The timetable goes on the notice board and home in a bag. It is read by
 *   somebody working out which morning to revise for.
 *
 *   The hall list is the invigilator's sheet. It is carried into the hall,
 *   read in seat order because that is the order the invigilator walks, and
 *   signed against.
 *
 *   The candidate slip is the pupil's own: their index number, and where they
 *   sit for each paper. It is the thing they lose and come to the office for.
 */

/** "Mon 16 Mar" */
function day(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "09:00" */
function clock(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function span(startsAt: Date, durationMins: number): string {
  return `${clock(startsAt)}–${clock(new Date(startsAt.getTime() + durationMins * 60_000))}`;
}

export type TimetablePaper = {
  startsAt: Date;
  durationMins: number;
  subject: string;
  title: string | null;
  classLevel: string;
  materials: string | null;
  halls: string[];
};

/**
 * The whole session's papers, grouped by day.
 *
 * By day rather than in one long table, because the question it is read to
 * answer is "what do I have on Wednesday" — a single table sorted by time
 * makes that a search rather than a glance.
 */
export function timetableMarkdown(input: {
  instructions: string | null;
  papers: TimetablePaper[];
}): string {
  const lines: string[] = [];

  if (input.instructions) {
    lines.push("## Instructions to candidates", "", input.instructions, "");
  }

  if (input.papers.length === 0) {
    lines.push("No papers have been timetabled yet.");
    return lines.join("\n");
  }

  const byDay = new Map<string, TimetablePaper[]>();
  for (const paper of [...input.papers].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )) {
    const key = day(paper.startsAt);
    const list = byDay.get(key);
    if (list) list.push(paper);
    else byDay.set(key, [paper]);
  }

  for (const [name, papers] of byDay) {
    lines.push(`## ${name}`, "", "| Time | Paper | Year | Where | Bring |", "| --- | --- | --- | --- | --- |");
    for (const paper of papers) {
      lines.push(
        `| ${span(paper.startsAt, paper.durationMins)} | ${paper.subject}${
          paper.title ? ` — ${paper.title}` : ""
        } | ${paper.classLevel} | ${paper.halls.join(", ") || "To be announced"} | ${
          paper.materials ?? "—"
        } |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export type HallListSeat = {
  seatNo: string;
  venue: string | null;
  candidateNo: string;
  name: string;
  className: string;
};

/**
 * The invigilator's sheet, in seat order.
 *
 * Seat order and not name order: the invigilator walks the hall row by row
 * handing out scripts, and a list alphabetised against that walk is a list
 * they have to search once per candidate.
 *
 * The signature column is empty on purpose — it is signed in the hall, and it
 * is what settles a query about a missing script three weeks later.
 */
export function hallListMarkdown(input: {
  instructions: string | null;
  paper: {
    subject: string;
    title: string | null;
    classLevel: string;
    startsAt: Date;
    durationMins: number;
    maxMarks: number | null;
    materials: string | null;
  };
  invigilators: Array<{ name: string; role: string }>;
  seats: HallListSeat[];
}): string {
  const { paper } = input;
  const lines: string[] = [];

  lines.push(
    `**${paper.subject}${paper.title ? ` — ${paper.title}` : ""}** · ${paper.classLevel}`,
    "",
    `${day(paper.startsAt)} · ${span(paper.startsAt, paper.durationMins)} · ${paper.durationMins} minutes${
      paper.maxMarks ? ` · out of ${paper.maxMarks}` : ""
    }`,
    "",
  );

  if (paper.materials) {
    lines.push(`Candidates may bring: ${paper.materials}`, "");
  }

  const chief = input.invigilators.find((one) => one.role === "CHIEF");
  const assisting = input.invigilators.filter((one) => one.role !== "CHIEF");
  lines.push(
    `Chief invigilator: ${chief?.name ?? "____________________"}`,
    "",
    `Assisting: ${assisting.map((one) => one.name).join(", ") || "____________________"}`,
    "",
  );

  if (input.instructions) {
    lines.push("> " + input.instructions.replace(/\n+/g, " "), "");
  }

  // Grouped by hall, because one sheet per hall is what the invigilator in
  // that hall actually needs — a combined list means two invigilators sharing
  // one piece of paper in two rooms.
  const byHall = new Map<string, HallListSeat[]>();
  for (const seat of input.seats) {
    const key = seat.venue ?? "Unassigned";
    const list = byHall.get(key);
    if (list) list.push(seat);
    else byHall.set(key, [seat]);
  }

  for (const [hall, seats] of byHall) {
    lines.push(
      `## ${hall} — ${seats.length} candidate${seats.length === 1 ? "" : "s"}`,
      "",
      "| Seat | Index | Candidate | Class | Signature |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const seat of seats) {
      lines.push(
        `| ${seat.seatNo} | ${seat.candidateNo} | ${seat.name} | ${seat.className} |  |`,
      );
    }
    lines.push(
      "",
      `Present: ________    Absent: ________    Scripts collected: ________`,
      "",
    );
  }

  return lines.join("\n");
}

export type SlipPaper = {
  startsAt: Date;
  durationMins: number;
  subject: string;
  title: string | null;
  seatNo: string;
  venue: string | null;
  materials: string | null;
};

/**
 * One candidate's own timetable.
 *
 * Their index number set large at the top, because that is the single thing
 * they are asked for and the single thing they forget. Everything else is the
 * papers they personally sit — not the year group's, theirs — in the order
 * they sit them.
 */
export function candidateSlipMarkdown(input: {
  instructions: string | null;
  candidateNo: string;
  name: string;
  className: string;
  papers: SlipPaper[];
}): string {
  const lines: string[] = [
    `# ${input.candidateNo}`,
    "",
    `**${input.name}** · ${input.className}`,
    "",
    "Write this index number on every script. Bring this slip to every paper.",
    "",
  ];

  if (input.papers.length === 0) {
    lines.push("No papers are timetabled for this candidate yet.");
    return lines.join("\n");
  }

  lines.push("| When | Paper | Hall | Seat | Bring |", "| --- | --- | --- | --- | --- |");
  for (const paper of [...input.papers].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )) {
    lines.push(
      `| ${day(paper.startsAt)} ${span(paper.startsAt, paper.durationMins)} | ${paper.subject}${
        paper.title ? ` — ${paper.title}` : ""
      } | ${paper.venue ?? "—"} | ${paper.seatNo} | ${paper.materials ?? "—"} |`,
    );
  }
  lines.push("");

  if (input.instructions) {
    lines.push("---", "", input.instructions);
  }

  return lines.join("\n");
}
