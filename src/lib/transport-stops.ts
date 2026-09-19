/**
 * Reading a bus route out of the list somebody already wrote down.
 *
 * Stops are typed as lines, not as eleven pairs of inputs, and that decision
 * is right and stays: a route arrives on paper or in a WhatsApp message, and
 * retyping it into a grid is how it ends up not being entered at all.
 *
 *     Spintex Junction | opposite Total | 06:40 | 15:40
 *
 * What was wrong was not the format. It was that the parser had no way to say
 * no.
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
 * meeting: two halves that disagree, where neither complains. So a line this
 * module cannot read is reported by line number and the save is refused. A
 * school would rather retype one line than discover a blank column in June.
 *
 * ---------------------------------------------------------------------------
 * A stop is not its name
 * ---------------------------------------------------------------------------
 *
 * Stops used to be matched to existing rows by name. Correct the spelling of
 * "Baatsona" and the old row did not get renamed: it was a stop that had
 * vanished from the list, so it was pushed to the end of the route, and a new
 * empty stop appeared in its place. Every child assigned to it was now waiting
 * at a phantom stop at position 999, on a route where nobody would look.
 *
 * A textarea cannot tell a rename from a deletion, so this module does not
 * guess. It reports what would be removed and how many children stand there,
 * and the caller refuses the save rather than quietly stranding them.
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

    // Three fields, and the middle one is a clock time. Nobody navigates by a
    // landmark called "07:15", so this is a stop whose landmark was left out
    // rather than a stop with a very strange landmark.
    //
    // Worth handling rather than refusing, because it is what people actually
    // type: the example above the box shows four fields, and a stop with no
    // useful landmark gets written with three. Read literally, the pick-up
    // time lands in the landmark column, the drop-off time lands in the
    // pick-up column, and the route goes to print an hour wrong in one
    // direction and blank in the other.
    // Only for the short forms. Somebody who typed all four fields meant all
    // four, even if the second one is odd.
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

/** Back to the one-per-line format, for the textarea when editing a route. */
export function formatStops(
  stops: Array<{
    name: string;
    landmark: string | null;
    pickupTime: string | null;
    dropoffTime: string | null;
  }>,
): string {
  return stops
    .map((stop) =>
      [stop.name, stop.landmark ?? "", stop.pickupTime ?? "", stop.dropoffTime ?? ""]
        .join(" | ")
        // Trailing empties are noise. A stop with only a name reads as its
        // name, not as a name followed by three bars.
        .replace(/(\s*\|\s*)+$/, ""),
    )
    .join("\n");
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
 */
export function stopRefusal(plan: StopPlan): string | null {
  if (plan.stranded.length === 0) return null;

  const names = plan.stranded
    .map((stop) => `${stop.name} (${stop.riders} ${stop.riders === 1 ? "child" : "children"})`)
    .join(", ");

  return `${plan.stranded.length === 1 ? "A stop has" : `${plan.stranded.length} stops have`} been taken off the list but ${plan.stranded.length === 1 ? "still has" : "still have"} children assigned: ${names}. Move them to another stop first, or put the stop back on the list. Renaming a stop looks the same as deleting one from here, so if that is what you meant, rename it on the child's record instead.`;
}
