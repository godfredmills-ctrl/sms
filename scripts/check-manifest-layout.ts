/**
 * Tests for the bus manifest's column geometry.
 *
 * The manifest shipped with a name column twelve points wider than the space
 * in front of it, so a long name printed over the class beside it. Both
 * numbers were correct about themselves and neither knew the other existed,
 * which is why the arithmetic below is worth writing down: the whole point of
 * deriving a width from the next column's start is that this test can then
 * check the derivation once instead of checking every call site forever.
 *
 * It is paper. Nobody gets an error message; somebody gets a sheet with two
 * words on top of each other and a child at a junction.
 */

import {
  BAND_COUNT_RESERVE,
  BAND_COUNT_RIGHT,
  BAND_TEXT_X,
  COLUMN_X,
  EXTRA_X,
  GUTTER,
  MARGIN,
  PAGE_W,
  ROW_COLUMNS,
  ROW_RIGHT,
  USABLE,
  bandTextWidth,
  columnWidth,
  extraWidth,
} from "../src/lib/manifest-layout";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
}

function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

// -----------------------------------------------------------------------------
// The page
// -----------------------------------------------------------------------------

check("A4 portrait, in points", PAGE_W, 595.28);
check("the usable width is the page less both margins", USABLE, PAGE_W - MARGIN * 2);
check("and the right edge is the left margin plus it", ROW_RIGHT, MARGIN + USABLE);
ok("which is inside the page", ROW_RIGHT <= PAGE_W);

// -----------------------------------------------------------------------------
// No column may touch the next
// -----------------------------------------------------------------------------

for (const [index, column] of ROW_COLUMNS.entries()) {
  const width = columnWidth(column);
  ok(`${column} has room to print in`, width > 0);

  const right = COLUMN_X[column] + width;
  const next = ROW_COLUMNS[index + 1];

  if (next) {
    ok(
      `${column} stops before ${next} starts`,
      right <= COLUMN_X[next],
    );
    check(
      `and leaves exactly the gutter between them`,
      COLUMN_X[next] - right,
      GUTTER,
    );
  } else {
    check(`${column} runs to the right margin`, right, ROW_RIGHT);
  }
}

ok(
  "the columns are in left-to-right order, which everything above assumes",
  ROW_COLUMNS.every(
    (column, index) => index === 0 || COLUMN_X[column] > COLUMN_X[ROW_COLUMNS[index - 1]],
  ),
);
ok("and every one starts inside the margins", ROW_COLUMNS.every((c) => COLUMN_X[c] >= MARGIN));
ok("and none starts past the right edge", ROW_COLUMNS.every((c) => COLUMN_X[c] < ROW_RIGHT));

// The exact case that was wrong. Written as a number rather than a formula so
// that changing the geometry has to change this line deliberately.
check("the name column is 198 points wide, not the 210 it used to claim", columnWidth("name"), 198);
check("the class column is 84", columnWidth("className"), 84);
ok(
  "a name filling its column stops short of where the class begins",
  COLUMN_X.name + columnWidth("name") < COLUMN_X.className,
);

// -----------------------------------------------------------------------------
// The stop heading band
// -----------------------------------------------------------------------------

ok("the band leaves room for its head count", bandTextWidth() > 0);
check(
  "and the stop name stops a gutter before that room",
  BAND_TEXT_X + bandTextWidth() + GUTTER,
  BAND_COUNT_RIGHT - BAND_COUNT_RESERVE,
);
ok("the count is drawn inside the right margin", BAND_COUNT_RIGHT <= ROW_RIGHT);
ok(
  "three digits of head count fit in the reserve at size 10",
  // Helvetica-Bold digits are 0.556em, so three of them at 10pt is 16.7.
  BAND_COUNT_RESERVE >= 3 * 5.56,
);

// -----------------------------------------------------------------------------
// The hand-over line
// -----------------------------------------------------------------------------

ok("the second line is indented under the name", EXTRA_X >= COLUMN_X.name);
check("and runs to the right margin", EXTRA_X + extraWidth(), ROW_RIGHT);
ok("with room to say something", extraWidth() > 200);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} manifest layout checks passed.`);
