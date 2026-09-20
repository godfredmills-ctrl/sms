/**
 * Where each column of the bus manifest begins, and how wide it may be.
 *
 * The manifest had a column that ran into the one beside it. The name was
 * drawn at x=64 and truncated to fit 210 points, so a long name reached 274;
 * the class was drawn at 270. Four points of overlap, on paper, in ink, on the
 * sheet an assistant reads at a junction in the dark.
 *
 * Nothing errored, and nothing could have. The two numbers were written in
 * different statements forty lines apart, each correct about itself, and
 * neither knew the other existed. The usual shape.
 *
 * So the widths are not written down. A column starts where it starts, and its
 * width is whatever is left before the next one begins, less a gutter. Move a
 * column and the one before it gives way automatically; there is no second
 * number to remember, because there is no second number.
 *
 * A4 portrait, in points, because that is what pdf-lib draws in and what a
 * school prints on.
 */

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 40;
export const USABLE = PAGE_W - MARGIN * 2;

/** Clear space between two columns, so ink never touches ink. */
export const GUTTER = 8;

/**
 * The columns of a child's row, in the order they are read.
 *
 * Left to right: the box somebody ticks with a biro, the child, their class,
 * and who to hand them to with a number to ring. The order is the order of the
 * question being asked at the roadside, which is why the phone is last and
 * flush right: it is what somebody reaches for when the answer is wrong.
 */
export const ROW_COLUMNS = ["tick", "name", "className", "contact"] as const;

export type RowColumn = (typeof ROW_COLUMNS)[number];

/** Where each column starts, measured from the left edge of the page. */
export const COLUMN_X: Record<RowColumn, number> = {
  tick: MARGIN + 6,
  name: MARGIN + 24,
  className: MARGIN + 230,
  contact: MARGIN + 322,
};

/** The right-hand limit of every row. Nothing is drawn past it. */
export const ROW_RIGHT = MARGIN + USABLE;

/**
 * How much room a column has, derived rather than declared.
 *
 * The last column runs to the right margin. Every other column stops a gutter
 * short of the next one, so no truncation width can be set wider than the
 * space that actually exists.
 */
export function columnWidth(column: RowColumn): number {
  const index = ROW_COLUMNS.indexOf(column);
  const next = ROW_COLUMNS[index + 1];
  const limit = next === undefined ? ROW_RIGHT : COLUMN_X[next] - GUTTER;
  return limit - COLUMN_X[column];
}

/**
 * The stop heading band: the stop name on the left, the head count on the
 * right. The count is drawn from the right edge, so the name is given what is
 * left rather than a number somebody guessed.
 */
export const BAND_TEXT_X = MARGIN + 8;
export const BAND_COUNT_RIGHT = MARGIN + USABLE - 8;

/** Room for the head count, so a long stop name cannot reach it. */
export const BAND_COUNT_RESERVE = 34;

export function bandTextWidth(): number {
  return BAND_COUNT_RIGHT - BAND_COUNT_RESERVE - GUTTER - BAND_TEXT_X;
}

/**
 * The second line under a child: who to hand them to, and anything else that
 * changes the handover. Indented under the name, and it runs to the margin.
 */
export const EXTRA_X = MARGIN + 24;

export function extraWidth(): number {
  return ROW_RIGHT - EXTRA_X;
}
