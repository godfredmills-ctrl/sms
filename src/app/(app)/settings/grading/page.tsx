import type { Metadata } from "next";
import { AlertTriangle, Gauge, Plus, Star, Trash2 } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import {
  addGradeBandAction,
  deleteGradeBandAction,
  setDefaultScaleAction,
} from "../actions";
import { ScaleForm } from "./scale-form";

export const metadata: Metadata = { title: "Grading scales" };
export const dynamic = "force-dynamic";

type Band = { grade: string; min: number; max: number };

/**
 * A scale with a hole in it silently mis-grades: a mark of 44 on a scale that
 * jumps 45→40 produces no band at all, and the report card prints a blank
 * where a grade should be. Overlaps are worse — the same mark yields different
 * grades depending on row order. Both are cheap to detect and worth surfacing
 * before a term's marks are entered against the scale.
 */
function auditBands(bands: Band[]): string[] {
  if (bands.length === 0) return ["No bands defined — marks cannot be graded."];

  const sorted = [...bands].sort((a, b) => a.min - b.min);
  const problems: string[] = [];

  if (sorted[0].min > 0) {
    problems.push(`Marks below ${sorted[0].min} fall outside every band.`);
  }
  const top = sorted[sorted.length - 1];
  if (top.max < 100) {
    problems.push(`Marks above ${top.max} fall outside every band.`);
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.min <= previous.max) {
      problems.push(
        `${previous.grade} and ${current.grade} overlap between ${current.min} and ${previous.max}.`,
      );
    } else if (current.min > previous.max + 1) {
      problems.push(
        `Nothing covers ${previous.max + 1}–${current.min - 1} (between ${previous.grade} and ${current.grade}).`,
      );
    }
  }

  return problems;
}

export default async function GradingPage() {
  await requirePermission("assessment.scale.manage");

  const scales = await db.gradeScale.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      bands: { orderBy: { sortKey: "asc" } },
      _count: { select: { reportCards: true } },
    },
  });

  const totalBands = scales.reduce((sum, scale) => sum + scale.bands.length, 0);
  const incomplete = scales.filter(
    (scale) =>
      auditBands(
        scale.bands.map((band) => ({
          grade: band.grade,
          min: Number(band.minScore),
          max: Number(band.maxScore),
        })),
      ).length > 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Grading scales"
        description="WASSCE, IGCSE, IB or your own — each scale maps a mark to a grade, a point and a remark."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Scales"
          value={scales.length}
          tone="violet"
          icon={<Gauge className="size-4" />}
        />
        <StatCard label="Bands" value={totalBands} tone="info" />
        <StatCard
          label="Default scale"
          value={scales.find((scale) => scale.isDefault)?.code ?? "None"}
          tone={scales.some((scale) => scale.isDefault) ? "success" : "warning"}
          icon={<Star className="size-4" />}
        />
        <StatCard
          label="Need attention"
          value={incomplete}
          hint="Gaps or overlaps"
          tone={incomplete ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {scales.map((scale) => {
            const bands = scale.bands.map((band) => ({
              ...band,
              min: Number(band.minScore),
              max: Number(band.maxScore),
            }));
            const problems = auditBands(
              bands.map((band) => ({
                grade: band.grade,
                min: band.min,
                max: band.max,
              })),
            );

            return (
              <Card key={scale.id}>
                <CardHeader
                  title={scale.name}
                  description={
                    scale.description ??
                    `${scale.code}${scale.maxPoint ? ` · max ${Number(scale.maxPoint)} points` : ""}`
                  }
                  action={
                    <>
                      {scale._count.reportCards > 0 ? (
                        <Badge tone="neutral">
                          {scale._count.reportCards} report cards
                        </Badge>
                      ) : null}
                      {scale.isDefault ? (
                        <Badge tone="success">
                          <Star className="size-2.5" />
                          Default
                        </Badge>
                      ) : (
                        <form action={setDefaultScaleAction}>
                          <input type="hidden" name="id" value={scale.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Make default
                          </Button>
                        </form>
                      )}
                    </>
                  }
                />

                <CardBody className="space-y-3">
                  {problems.length ? (
                    <Alert tone="warning">
                      <ul className="list-inside list-disc space-y-0.5 text-xs">
                        {problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    </Alert>
                  ) : null}

                  {bands.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                            <th className="py-1.5 pr-3 font-medium">Grade</th>
                            <th className="py-1.5 pr-3 font-medium">Range</th>
                            <th className="py-1.5 pr-3 font-medium">Point</th>
                            <th className="py-1.5 pr-3 font-medium">Remark</th>
                            <th className="py-1.5 pr-3 font-medium">Pass</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {bands.map((band) => (
                            <tr
                              key={band.id}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="py-1.5 pr-3 font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  {band.colour ? (
                                    <span
                                      aria-hidden
                                      className="size-2 rounded-full"
                                      style={{ background: band.colour }}
                                    />
                                  ) : null}
                                  {band.grade}
                                </span>
                              </td>
                              <td className="numeric py-1.5 pr-3">
                                {band.min}–{band.max}
                              </td>
                              <td className="numeric py-1.5 pr-3">
                                {band.point === null ? "—" : Number(band.point)}
                              </td>
                              <td className="py-1.5 pr-3 text-[var(--text-muted)]">
                                {band.remark ?? "—"}
                              </td>
                              <td className="py-1.5 pr-3">
                                <Badge tone={band.isPass ? "success" : "danger"}>
                                  {band.isPass ? "Pass" : "Fail"}
                                </Badge>
                              </td>
                              <td className="py-1.5">
                                <form action={deleteGradeBandAction}>
                                  <input type="hidden" name="id" value={band.id} />
                                  <button
                                    type="submit"
                                    title="Remove band"
                                    className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--text-subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <form
                    action={addGradeBandAction}
                    className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3"
                  >
                    <input type="hidden" name="scaleId" value={scale.id} />
                    <Field label="Grade" htmlFor={`grade-${scale.id}`} className="w-20">
                      <Input id={`grade-${scale.id}`} name="grade" required placeholder="A1" />
                    </Field>
                    <Field label="From" htmlFor={`min-${scale.id}`} className="w-20">
                      <Input
                        id={`min-${scale.id}`}
                        name="minScore"
                        type="number"
                        min="0"
                        max="100"
                        required
                      />
                    </Field>
                    <Field label="To" htmlFor={`max-${scale.id}`} className="w-20">
                      <Input
                        id={`max-${scale.id}`}
                        name="maxScore"
                        type="number"
                        min="0"
                        max="100"
                        required
                      />
                    </Field>
                    <Field label="Point" htmlFor={`point-${scale.id}`} className="w-20">
                      <Input
                        id={`point-${scale.id}`}
                        name="point"
                        type="number"
                        step="0.1"
                        min="0"
                      />
                    </Field>
                    <Field
                      label="Remark"
                      htmlFor={`remark-${scale.id}`}
                      className="min-w-[140px] flex-1"
                    >
                      <Input id={`remark-${scale.id}`} name="remark" placeholder="Excellent" />
                    </Field>
                    <label className="mb-2 flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        name="isPass"
                        defaultChecked
                        className="size-4 rounded border-[var(--border-strong)] accent-[var(--primary)]"
                      />
                      Pass
                    </label>
                    <Button type="submit" variant="outline" size="sm" className="mb-0.5">
                      <Plus className="size-3.5" />
                      Add band
                    </Button>
                  </form>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div>
          <Card>
            <CardHeader title="New scale" />
            <ScaleForm />
          </Card>
        </div>
      </div>
    </>
  );
}
