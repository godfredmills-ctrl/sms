/**
 * What kind of thing somebody is writing.
 *
 * A plain module, deliberately. It lived in actions.ts, which carries
 * "use server" — and every export of such a module becomes a callable
 * endpoint, so an array there throws "A 'use server' file can only export
 * async functions, found object" on the first page load. That defect reached
 * a live school once; scripts/check-server-exports.mjs now refuses the build,
 * and it refused this one.
 */
export const DOCUMENT_KINDS = [
  { value: "LETTER", label: "Letter" },
  { value: "REPORT", label: "Report" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "NOTICE", label: "Notice" },
  { value: "MINUTES", label: "Minutes" },
] as const;

export function kindLabel(value: string): string {
  return DOCUMENT_KINDS.find((entry) => entry.value === value)?.label ?? value;
}
