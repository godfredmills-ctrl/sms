/**
 * The stops on a bus route.
 *
 * Two ways in, and the difference between them is identity.
 *
 * parseRows takes the editor's rows, each carrying the id of the stop it is.
 * That is the ordinary path and the reason the editor stopped being a
 * textarea: given an id, correcting the spelling of a stop is an update to a
 * known row, and the children standing there never notice.
 *
 * parseStops takes lines of "Spintex Junction | opposite Total | 06:40 |
 * 15:40", which is how a route arrives, on paper or in a WhatsApp message.
 * Those lines carry no identity at all, so they can only ever make new stops.
 * The editor keeps them as a paste box for exactly that: getting a route in
 * quickly, after which it is corrected as rows.
 *
 * ---------------------------------------------------------------------------
 * A stop is not its name
 * ---------------------------------------------------------------------------
 *
 * Stops used to be matched to existing rows by name, because lines were the
 * only way in. Correct the spelling of "Baatsona" and the old row did not get
 * renamed: it was a name that had vanished, so it was pushed to sequence 999
 * and a new empty stop appeared in its place. Every child assigned to it was
 * then waiting at a phantom stop at the end of a route nobody scrolls to.
 * That was called a safeguard. It was a hiding place.
 *
 * Rows fixed it at the source. What remains is the honest residue: a stop that
 * has genuinely been removed and still has children assigned refuses the save,
 * names itself, and counts them.
 *
 * ---------------------------------------------------------------------------
 * A time it cannot read is not a time it should discard
 * ---------------------------------------------------------------------------
 *
 * Written "06.40" rather than "06:40", the old parser tested the pattern,
 * failed, and stored null. The stop saved. The form said it had saved. The
 * printed timetable then had a stop with no pick-up time on it, and the first
 * person to find out was a parent standing at a junction.
 *
 * Nothing errored, which is the signature of every bug this codebase keeps
 * meeting: two halves that disagree, where neither complains. Both paths now
 * report what they cannot read and refuse the save. A school would rather
 * retype one stop than discover a blank column in June.
 */

export type ParsedStop = {
  /** 1-based, so a problem can name the line the person is looking at. */
  line: number;
  name: string;
  landmark: string | null;
  pickupTime: string | null;
  dropoffTime: string | null;
};

export type StopProblem = {
  line: number;
  message: string;
};

export type ParsedRoute = {
  stops: ParsedStop[];
  problems: StopProblem[];
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A time, or a complaint.
 *
 * An empty field is a stop the school has not timed yet, which is ordinary and
 * allowed. A field with something in it that is not a time is a mistake, and
 * saying so is the entire point of this file.
 */
function readTime(raw: string | undefined): { value: string | null; bad: boolean } {
  const text = (raw ?? "").trim();
  if (!text) return { value: null, bad: false };
  if (CLOCK.test(text)) return { value: text, bad: false };
  return { value: null, bad: true };
}

/** The stops on a route, and everything wrong with how they were typed. */
export function parseStops(input: string): ParsedRoute {
  const stops: ParsedStop[] = [];
  const problems: StopProblem[] = [];
  const seen = new Map<string, number>();

  const lines = String(input ?? "").split("\n");

  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const parts = trimmed.split("|").map((part) => part.trim());

    if (parts.length > 4) {
      problems.push({
        line,
        message:
          "Too many parts. A stop is name, landmark, pick-up, drop-off. If the landmark itself has a vertical bar in it, take it out.",
      });
      return;
    }

    // A short line whose second field is a clock time. Nobody navigates by a
    // landmark called "07:15", so this is a stop whose landmark was left out
    // rather than a stop with a very strange landmark.
    //
    // Worth handling rather than refusing, because it is what people actually
    // write: the example shows four fields, and a stop with no useful landmark
    // gets written with three. Read literally, the pick-up time lands in the
    // landmark column and the drop-off time lands in the pick-up column, so
    // the route goes to print an hour wrong in one direction and blank in the
    // other. Only for the short forms: somebody who typed all four fields
    // meant all four, even if the second one is odd.
    const shifted = parts.length <= 3 && CLOCK.test(parts[1] ?? "");

    const [name, landmark, pickup, dropoff] = shifted
      ? [parts[0], "", ...parts.slice(1)]
      : parts;

    if (!name) {
      problems.push({ line, message: "This line has no stop name." });
      return;
    }

    const key = name.toLowerCase();
    const earlier = seen.get(key);
    if (earlier) {
      problems.push({
        line,
        message: `"${name}" is already on this route at line ${earlier}. Two stops with one name cannot be told apart.`,
      });
      return;
    }
    seen.set(key, line);

    const arrival = readTime(pickup);
    const departure = readTime(dropoff);

    if (arrival.bad) {
      problems.push({
        line,
        message: `"${(pickup ?? "").trim()}" is not a pick-up time. Write it as 06:40, on the 24-hour clock.`,
      });
      return;
    }
    if (departure.bad) {
      problems.push({
        line,
        message: `"${(dropoff ?? "").trim()}" is not a drop-off time. Write it as 15:40, on the 24-hour clock.`,
      });
      return;
    }

    stops.push({
      line,
      name,
      landmark: landmark || null,
      pickupTime: arrival.value,
      dropoffTime: departure.value,
    });
  });

  return { stops, problems };
}

// ---------------------------------------------------------------------------
// What saving would actually do
// ---------------------------------------------------------------------------

export type ExistingStop = {
  id: string;
  name: string;
  /** Children standing at this stop who have not been moved off it. */
  riders: number;
};

export type StopPlan = {
  /** Existing rows to update, in their new order. */
  update: Array<{ id: string; stop: ParsedStop; sequence: number }>;
  /** Rows to create, in their new order. */
  create: Array<{ stop: ParsedStop; sequence: number }>;
  /** Rows no longer in the list and safe to remove: nobody stands there. */
  remove: string[];
  /**
   * Rows no longer in the list that children are still assigned to.
   *
   * Never removed, and never silently reordered out of sight either. The
   * caller refuses the save and shows these, because the only honest options
   * are to put the stop back or to move the children first, and a computer
   * cannot tell which was meant.
   */
  stranded: ExistingStop[];
};

/**
 * What a save would do to the stops that already exist.
 *
 * Matching is still by name, because a list of lines carries no identity. The
 * difference is what happens to the ones that fall off the end: they used to
 * be shoved to sequence 999 and left there, which is a stop nobody can see and
 * children who are still assigned to it.
 */
export function planStops(parsed: ParsedStop[], existing: ExistingStop[]): StopPlan {
  const byName = new Map(existing.map((stop) => [stop.name.toLowerCase(), stop]));

  const update: StopPlan["update"] = [];
  const create: StopPlan["create"] = [];

  parsed.forEach((stop, index) => {
    const sequence = index + 1;
    const match = byName.get(stop.name.toLowerCase());
    if (match) {
      update.push({ id: match.id, stop, sequence });
      byName.delete(stop.name.toLowerCase());
    } else {
      create.push({ stop, sequence });
    }
  });

  const leftover = [...byName.values()];
  return {
    update,
    create,
    remove: leftover.filter((stop) => stop.riders === 0).map((stop) => stop.id),
    stranded: leftover.filter((stop) => stop.riders > 0),
  };
}

/**
 * Why this save cannot go ahead, or null.
 *
 * Named separately from the plan so the form and the action can ask the same
 * question and get the same sentence. A screen that accepts what the action
 * refuses is a screen that loses somebody's work.
 *
 * `renameIsAmbiguous` is for the pasted-list path only. A list of lines has no
 * identity in it, so a stop that is no longer on the list might have been
 * renamed rather than removed, and the sentence has to say so. Rows carry
 * their stop id, so a removal there is a removal and nothing else.
 */
export function stopRefusal(
  plan: StopPlan,
  options: { renameIsAmbiguous?: boolean } = {},
): string | null {
  if (plan.stranded.length === 0) return null;

  const names = plan.stranded
    .map((stop) => `${stop.name} (${stop.riders} ${stop.riders === 1 ? "child" : "children"})`)
    .join(", ");

  const opening =
    plan.stranded.length === 1
      ? "A stop has been removed but still has children assigned"
      : `${plan.stranded.length} stops have been removed but still have children assigned`;

  const ambiguity = options.renameIsAmbiguous
    ? " Renaming a stop looks the same as deleting one from a pasted list, so if that is what you meant, edit the stop in place instead."
    : "";

  return `${opening}: ${names}. Move them to another stop first, or put the stop back.${ambiguity}`;
}

// ---------------------------------------------------------------------------
// Rows, which carry identity
// ---------------------------------------------------------------------------

/**
 * A stop as the editor holds it: the same four fields, plus which stop it is.
 *
 * The id is the whole difference between this and a pasted line. Given it,
 * correcting the spelling of a stop is an update to a known row, and the
 * children standing there never notice. Without it the only honest reading of
 * a vanished name is that the stop is gone, which is why the pasted path has
 * to refuse what this path does without comment.
 */
export type StopRow = {
  id: string | null;
  name: string;
  landmark: string | null;
  pickupTime: string | null;
  dropoffTime: string | null;
};

/**
 * Rows out of the parallel arrays a repeated form field posts.
 *
 * FormData.getAll keeps document order, so the arrays line up by index and the
 * order of the rows on screen is the order along the route. Rows with nothing
 * in the name are dropped rather than refused: an empty row is what a half
 * pressed "add stop" leaves behind, and it is not a mistake worth a sentence.
 */
export function parseRows(input: {
  ids: string[];
  names: string[];
  landmarks: string[];
  pickups: string[];
  dropoffs: string[];
}): ParsedRoute & { rows: StopRow[] } {
  const rows: StopRow[] = [];
  const stops: ParsedStop[] = [];
  const problems: StopProblem[] = [];
  const seen = new Map<string, number>();

  const count = Math.max(
    input.names.length,
    input.ids.length,
    input.landmarks.length,
    input.pickups.length,
    input.dropoffs.length,
  );

  for (let index = 0; index < count; index += 1) {
    const line = index + 1;
    const name = (input.names[index] ?? "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    const earlier = seen.get(key);
    if (earlier) {
      problems.push({
        line,
        message: `"${name}" is already stop ${earlier} on this route. Two stops with one name cannot be told apart.`,
      });
      continue;
    }
    seen.set(key, line);

    const arrival = readTime(input.pickups[index]);
    const departure = readTime(input.dropoffs[index]);

    if (arrival.bad) {
      problems.push({
        line,
        message: `"${(input.pickups[index] ?? "").trim()}" is not a pick-up time. Write it as 06:40, on the 24-hour clock.`,
      });
      continue;
    }
    if (departure.bad) {
      problems.push({
        line,
        message: `"${(input.dropoffs[index] ?? "").trim()}" is not a drop-off time. Write it as 15:40, on the 24-hour clock.`,
      });
      continue;
    }

    const landmark = (input.landmarks[index] ?? "").trim() || null;

    rows.push({
      id: (input.ids[index] ?? "").trim() || null,
      name,
      landmark,
      pickupTime: arrival.value,
      dropoffTime: departure.value,
    });
    stops.push({ line, name, landmark, pickupTime: arrival.value, dropoffTime: departure.value });
  }

  return { rows, stops, problems };
}

/**
 * What saving rows would do.
 *
 * Unlike the pasted version this matches on the id the row carries, so a
 * renamed stop is an update and keeps every child standing at it. A row with
 * no id is new. An existing stop with no row is gone, deliberately, because
 * somebody pressed remove on it.
 *
 * An id that no longer exists is treated as new rather than trusted. Two
 * people editing one route is the ordinary case in a school office, and a
 * stale id from a form opened ten minutes ago must not update a row that has
 * since become something else.
 */
export function planRows(rows: StopRow[], existing: ExistingStop[]): StopPlan {
  const known = new Map(existing.map((stop) => [stop.id, stop]));
  const kept = new Set<string>();

  const update: StopPlan["update"] = [];
  const create: StopPlan["create"] = [];

  rows.forEach((row, index) => {
    const sequence = index + 1;
    const stop: ParsedStop = {
      line: sequence,
      name: row.name,
      landmark: row.landmark,
      pickupTime: row.pickupTime,
      dropoffTime: row.dropoffTime,
    };

    if (row.id && known.has(row.id)) {
      update.push({ id: row.id, stop, sequence });
      kept.add(row.id);
    } else {
      create.push({ stop, sequence });
    }
  });

  const gone = existing.filter((stop) => !kept.has(stop.id));
  return {
    update,
    create,
    remove: gone.filter((stop) => stop.riders === 0).map((stop) => stop.id),
    stranded: gone.filter((stop) => stop.riders > 0),
  };
}
