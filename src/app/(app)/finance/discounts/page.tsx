import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Check, HandCoins, Undo2, Users } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, fullName, listName } from "@/lib/utils";

import { toggleDiscountAction } from "../actions";
import { DiscountForm } from "./discount-form";

export const metadata: Metadata = { title: "Discounts" };
export const dynamic = "force-dynamic";

export default async function DiscountsPage() {
  await requirePermission("finance.discount.manage");

  const [discounts, students, categories, years] = await Promise.all([
    db.studentDiscount.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        },
      },
    }),
    db.student.findMany({
      where: { status: "ENROLLED" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 1500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
      },
    }),
    db.feeCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const active = discounts.filter((discount) => discount.isActive);
  const beneficiaries = new Set(active.map((discount) => discount.studentId)).size;
  const percentageAwards = active.filter((discount) => discount.type === "PERCENTAGE");
  const fixedValue = active
    .filter((discount) => discount.type === "FIXED")
    .reduce((sum, discount) => sum + discount.value, 0);
  const averagePercent = percentageAwards.length
    ? Math.round(
        percentageAwards.reduce((sum, discount) => sum + discount.value, 0) /
          percentageAwards.length,
      )
    : 0;

  return (
    <>
      <PageHeader
        title="Discounts & scholarships"
        description="Staff-child concessions, sibling discounts, bursaries and sponsored places."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active awards"
          value={active.length}
          tone="violet"
          icon={<BadgePercent className="size-4" />}
        />
        <StatCard
          label="Students benefiting"
          value={beneficiaries}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Average percentage"
          value={`${averagePercent}%`}
          hint={`${percentageAwards.length} percentage awards`}
          tone="teal"
        />
        <StatCard
          label="Fixed awards"
          value={formatMoney(fixedValue)}
          hint="Per billing period"
          tone="warning"
          icon={<HandCoins className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {discounts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BadgePercent className="size-5" />}
                title="No discounts awarded"
                description="Award one on the right — it is applied automatically the next time the student is billed."
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Awards"
                description="Applied automatically at billing. Category-scoped awards touch only their own line; unscoped awards apply to the whole bill."
              />
              <ul className="divide-y divide-[var(--border)]">
                {discounts.map((discount) => (
                  <li
                    key={discount.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${
                            discount.isActive
                              ? ""
                              : "text-[var(--text-subtle)] line-through"
                          }`}
                        >
                          {discount.name}
                        </span>
                        <Badge tone={discount.type === "PERCENTAGE" ? "info" : "violet"}>
                          {discount.type === "PERCENTAGE"
                            ? `${discount.value}%`
                            : formatMoney(discount.value)}
                        </Badge>
                        {discount.categoryId ? (
                          <Badge tone="neutral">
                            {categoryNames.get(discount.categoryId) ?? "Category"}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Whole bill</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        <Link
                          href={`/students/${discount.student.id}`}
                          className="hover:text-[var(--primary)]"
                        >
                          {listName(discount.student)}
                        </Link>{" "}
                        · {discount.student.admissionNo}
                        {discount.sponsorName ? ` · ${discount.sponsorName}` : ""}
                      </p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {discount.startsOn ? `From ${formatDate(discount.startsOn)}` : ""}
                        {discount.endsOn ? ` to ${formatDate(discount.endsOn)}` : ""}
                        {discount.approvedBy ? ` · approved by ${discount.approvedBy}` : ""}
                      </p>
                      {discount.reason ? (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {discount.reason}
                        </p>
                      ) : null}
                    </div>

                    <form action={toggleDiscountAction}>
                      <input type="hidden" name="id" value={discount.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {discount.isActive ? (
                          <>
                            <Undo2 className="size-3.5" />
                            Withdraw
                          </>
                        ) : (
                          <>
                            <Check className="size-3.5" />
                            Restore
                          </>
                        )}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Award a discount" />
            <DiscountForm
              students={students.map((student) => ({
                value: student.id,
                label: listName(student),
                description: student.admissionNo,
              }))}
              categories={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              years={years.map((year) => ({
                value: year.id,
                label: year.name,
                description: year.isCurrent ? "Current" : undefined,
              }))}
            />
          </Card>

          <Card>
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Withdrawn, not deleted
              </p>
              <p>
                A withdrawn award stops applying to future bills but stays on the
                record. Invoices already raised under it are unchanged — reducing a
                bill a family has already been told about is a credit note, not an
                edit.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
