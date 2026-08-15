import { Heart, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";

export type FamilyNode = {
  id: string;
  fullName: string;
  relation: string;
  relationLabel?: string | null;
  /** -2 grandparent, -1 parent, 0 sibling/self, 1 child. */
  generation: number;
  lineage?: string | null;
  isDeceased?: boolean;
  isAlumnus?: boolean;
  occupation?: string | null;
  phone?: string | null;
  isGuardianRecord?: boolean;
  isStudentRecord?: boolean;
};

/**
 * Family tree.
 *
 * Rendered as generation bands rather than a strict pedigree chart: real
 * household structures here include step-parents, sponsors, aunts acting as
 * guardians and siblings across year groups, none of which fit a clean
 * two-parent tree. Bands stay readable when the shape is irregular.
 */
export function FamilyTree({
  student,
  nodes,
}: {
  student: { fullName: string; photoUrl?: string | null; className?: string };
  nodes: FamilyNode[];
}) {
  const generations = [
    { level: -2, label: "Grandparents" },
    { level: -1, label: "Parents & guardians" },
    { level: 0, label: "Siblings & cousins" },
    { level: 1, label: "Children" },
  ];

  const paternal = (node: FamilyNode) => node.lineage === "PATERNAL";
  const maternal = (node: FamilyNode) => node.lineage === "MATERNAL";

  return (
    <div className="space-y-6">
      {generations.map((generation) => {
        const members = nodes.filter((node) => node.generation === generation.level);
        if (!members.length && generation.level !== 0) return null;

        return (
          <section key={generation.level}>
            <div className="mb-2.5 flex items-center gap-3">
              <h3 className="text-[11px] font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                {generation.label}
              </h3>
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="numeric text-[11px] text-[var(--text-subtle)]">
                {members.length + (generation.level === 0 ? 1 : 0)}
              </span>
            </div>

            {/* Split by lineage when both sides are recorded, so it is obvious
                which relatives belong to which side of the family. */}
            {members.some(paternal) && members.some(maternal) ? (
              <div className="grid gap-4 md:grid-cols-2">
                <LineageColumn label="Paternal" members={members.filter(paternal)} />
                <LineageColumn label="Maternal" members={members.filter(maternal)} />
                {members.filter((node) => !paternal(node) && !maternal(node)).length ? (
                  <div className="md:col-span-2">
                    <NodeGrid
                      members={members.filter(
                        (node) => !paternal(node) && !maternal(node),
                      )}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                {generation.level === 0 ? (
                  <div className="rounded-xl border-2 border-[var(--primary)] bg-[var(--primary-soft)] p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-text)]">
                        <User className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--primary)]">
                          {student.fullName}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {student.className ?? "This student"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {members.length ? <NodeGrid members={members} /> : null}
              </div>
            )}
          </section>
        );
      })}

      {nodes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-[var(--text-muted)]">
          No family members recorded yet. Add parents, guardians and siblings to build
          the family tree.
        </p>
      ) : null}
    </div>
  );
}

function LineageColumn({ label, members }: { label: string; members: FamilyNode[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium tracking-wider text-[var(--text-subtle)] uppercase">
        {label} side
      </p>
      <NodeGrid members={members} />
    </div>
  );
}

function NodeGrid({ members }: { members: FamilyNode[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {members.map((node) => (
        <li
          key={node.id}
          className={cn(
            "rounded-lg border border-[var(--border)] p-3",
            node.isDeceased && "opacity-60",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text)]">
                {node.fullName}
                {node.isDeceased ? (
                  <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                    (deceased)
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {humanRelation(node.relation, node.relationLabel)}
                {node.occupation ? ` · ${node.occupation}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {node.isGuardianRecord ? <Badge tone="primary">Guardian</Badge> : null}
              {node.isStudentRecord ? <Badge tone="info">Student here</Badge> : null}
              {node.isAlumnus ? (
                <Badge tone="neutral">
                  <Heart className="size-2.5" />
                  Alumnus
                </Badge>
              ) : null}
            </div>
          </div>
          {node.phone ? (
            <p className="numeric mt-1.5 text-xs text-[var(--text-subtle)]">
              {node.phone}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function humanRelation(relation: string, label?: string | null): string {
  if (relation === "OTHER" && label) return label;
  return relation
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
