/**
 * The seating allocator, checked against the thing it exists to prevent.
 *
 *   npm run exams:check
 *
 * Seating is the one part of running an examination that cannot be checked by
 * looking at it: a hall plan looks equally correct whether or not the pupil in
 * seat 14 spent all term beside the pupil in seat 15. So the property is
 * asserted instead — how many adjacent pairs share a class — over the shapes a
 * school actually presents: three even sections, one section twice the size of
 * the others, a single section with nowhere to interleave, and halls that
 * happen to start with the same letter.
 */
import { hallLetters, planSeats, type Hall } from "../src/lib/exams";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`);
    console.log(`         expected ${b}`);
    console.log(`         actual   ${a}`);
  }
}

/** Candidates: `sections` sections of `each` pupils. */
function cohort(sections: Record<string, number>) {
  const people: Array<{ id: string; classSectionId: string | null }> = [];
  for (const [section, count] of Object.entries(sections)) {
    for (let index = 0; index < count; index += 1) {
      people.push({ id: `${section}-${index}`, classSectionId: section });
    }
  }
  return people;
}

/** How many neighbouring seats hold two pupils from the same class. */
function neighbouringClassmates(
  plan: ReturnType<typeof planSeats>["plan"],
  people: Array<{ id: string; classSectionId: string | null }>,
) {
  const sectionOf = new Map(people.map((person) => [person.id, person.classSectionId]));
  const bySeat = [...plan].sort((a, b) => a.seatNo.localeCompare(b.seatNo));

  let adjacent = 0;
  for (let index = 1; index < bySeat.length; index += 1) {
    // Only within a hall — the last seat of one hall is not beside the first
    // seat of another.
    if (bySeat[index].venueId !== bySeat[index - 1].venueId) continue;
    if (sectionOf.get(bySeat[index].candidateId) === sectionOf.get(bySeat[index - 1].candidateId)) {
      adjacent += 1;
    }
  }
  return adjacent;
}

console.log("\nSeating\n");

const hall = (id: string, name: string, capacity: number): Hall => ({ id, name, capacity });

// Three even sections in one hall: dealt in rotation, so no two neighbours
// should ever share a class.
{
  const people = cohort({ "3A": 30, "3B": 30, "3C": 30 });
  const { plan, unseated } = planSeats(people, [hall("h1", "Assembly Hall", 100)]);
  check("everyone is seated", plan.length, 90);
  check("nobody is left standing", unseated, 0);
  check("no two neighbours are classmates", neighbouringClassmates(plan, people), 0);
  check("seat numbers carry the hall", plan[0].seatNo, "A-001");
}

// One section much larger than the others: the run of classmates at the end is
// unavoidable, but it should be no longer than the arithmetic forces.
{
  const people = cohort({ "3A": 40, "3B": 10, "3C": 10 });
  const { plan } = planSeats(people, [hall("h1", "Assembly Hall", 100)]);
  // After 10 rounds of three, 3A has 30 left and sits alone: 29 adjacent pairs.
  check("the long section runs on only at the end", neighbouringClassmates(plan, people), 29);
}

// A single section has nobody to interleave with. It should still seat
// everyone rather than fail.
{
  const people = cohort({ "3A": 25 });
  const { plan, unseated } = planSeats(people, [hall("h1", "Assembly Hall", 30)]);
  check("a single section still seats", plan.length, 25);
  check("with nobody left over", unseated, 0);
}

// More candidates than seats: the overflow is reported rather than silently
// dropped, because a candidate with no seat has to be found before the morning.
{
  const people = cohort({ "3A": 30, "3B": 30 });
  const { plan, unseated } = planSeats(people, [hall("h1", "Assembly Hall", 40)]);
  check("the hall fills", plan.length, 40);
  check("the overflow is counted", unseated, 20);
}

// Two halls: filled in order, each numbering from 1 under its own prefix.
{
  const people = cohort({ "3A": 30, "3B": 30 });
  const { plan, unseated } = planSeats(people, [
    hall("h1", "Assembly Hall", 40),
    hall("h2", "Dining Hall", 40),
  ]);
  check("both halls are used", new Set(plan.map((seat) => seat.venueId)).size, 2);
  check("everyone is seated", unseated, 0);
  check("the second hall numbers from one", plan[40].seatNo, "D-001");
}

// Two halls whose names begin with the same letter — the case that would
// produce two A-001s and fail the paper's unique seat number halfway through
// an allocation that had already seated half a year group.
{
  const people = cohort({ "3A": 30, "3B": 30 });
  const halls = [hall("h1", "Assembly Hall", 40), hall("h2", "Art Room", 40)];
  const { plan } = planSeats(people, halls);
  const numbers = plan.map((seat) => seat.seatNo);
  check("every seat number is distinct", new Set(numbers).size, numbers.length);
  check("the prefixes differ", [...new Set(numbers.map((no) => no.split("-")[0]))].length, 2);
}

console.log("\nHall prefixes\n");

{
  const letters = hallLetters([
    hall("h1", "Assembly Hall", 10),
    hall("h2", "Art Room", 10),
    hall("h3", "Basketball Court", 10),
  ]);
  check("the first keeps its letter", letters.get("h1"), "A");
  check("the second lengthens rather than collide", letters.get("h2"), "AR");
  check("an unrelated hall is unaffected", letters.get("h3"), "B");
}

{
  // A name with nothing alphanumeric in it still has to produce something.
  const letters = hallLetters([hall("h1", "—", 10)]);
  check("a nameless hall still gets a prefix", letters.get("h1"), "H");
}

{
  // No halls at all: everybody is unseated, and nothing throws.
  const people = cohort({ "3A": 5 });
  const { plan, unseated } = planSeats(people, []);
  check("no halls seats nobody", plan.length, 0);
  check("and says so", unseated, 5);
}

// A candidate with no class recorded is still a candidate, and still needs a
// seat — they were grouped under "unplaced" rather than dropped.
{
  const people = [
    ...cohort({ "3A": 5 }),
    { id: "loose-1", classSectionId: null },
    { id: "loose-2", classSectionId: null },
  ];
  const { plan, unseated } = planSeats(people, [hall("h1", "Hall", 20)]);
  check("a candidate with no class is seated", plan.length, 7);
  check("with nobody left over", unseated, 0);
}

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
