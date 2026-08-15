import "server-only";

import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { fullName, humanise, toNumber } from "@/lib/utils";

import type { DatasetKey, ReportRow } from "@/lib/reporting";

/**
 * The database half of the report engine. Kept apart from `reporting.ts` so a
 * client component can import a field label without pulling Prisma into the
 * browser bundle — `server-only` turns that mistake into a build error rather
 * than a runtime surprise.
 */

const PRESENT_STATES = ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"];

/** Loads the raw rows for a dataset. Filtering happens after, in memory. */
export async function loadDataset(key: DatasetKey): Promise<ReportRow[]> {
  switch (key) {
    case "students": {
      const students = await db.student.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          gender: true,
          status: true,
          house: true,
          isBoarder: true,
          nationality: true,
          dateOfBirth: true,
          admissionDate: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
          },
          invoices: {
            where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
            select: { balanceMinor: true },
          },
          attendance: { select: { status: true } },
        },
      });

      return students.map((student) => {
        const section = student.enrollments[0]?.classSection;
        const guardian = student.guardians[0]?.guardian;
        const present = student.attendance.filter((record) =>
          PRESENT_STATES.includes(record.status),
        ).length;

        return {
          admissionNo: student.admissionNo,
          name: fullName(student),
          gender: humanise(student.gender),
          status: humanise(student.status),
          className: section ? `${section.classLevel.name} ${section.name}` : "Unassigned",
          classLevel: section?.classLevel.name ?? "Unassigned",
          house: student.house ?? "",
          boarding: student.isBoarder ? "Boarder" : "Day",
          nationality: student.nationality ?? "",
          dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
          admissionDate: student.admissionDate?.toISOString() ?? null,
          guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}` : "",
          guardianPhone: guardian?.phone ?? "",
          outstanding: student.invoices.reduce(
            (sum, invoice) => sum + invoice.balanceMinor,
            0,
          ),
          attendanceRate: student.attendance.length
            ? Math.round((present / student.attendance.length) * 1000) / 10
            : null,
        };
      });
    }

    case "staff": {
      const staff = await db.staff.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          staffNo: true,
          title: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          jobTitle: true,
          department: true,
          employmentType: true,
          status: true,
          isTeaching: true,
          phone: true,
          email: true,
          hireDate: true,
          _count: { select: { offerings: true } },
        },
      });

      return staff.map((member) => ({
        staffNo: member.staffNo,
        name: fullName(member),
        jobTitle: member.jobTitle ?? "",
        department: member.department ?? "Unassigned",
        employmentType: humanise(member.employmentType),
        status: humanise(member.status),
        isTeaching: member.isTeaching ? "Teaching" : "Non-teaching",
        classesTaught: member._count.offerings,
        phone: member.phone ?? "",
        email: member.email ?? "",
        hireDate: member.hireDate?.toISOString() ?? null,
      }));
    }

    case "attendance": {
      const students = await db.student.findMany({
        where: { status: "ENROLLED" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
          attendance: { select: { status: true } },
        },
      });

      return students.map((student) => {
        const section = student.enrollments[0]?.classSection;
        const sessions = student.attendance.length;
        const present = student.attendance.filter((record) =>
          PRESENT_STATES.includes(record.status),
        ).length;

        return {
          admissionNo: student.admissionNo,
          name: fullName(student),
          className: section ? `${section.classLevel.name} ${section.name}` : "Unassigned",
          sessions,
          present,
          absent: student.attendance.filter((record) => record.status === "ABSENT").length,
          late: student.attendance.filter((record) => record.status === "LATE").length,
          rate: sessions ? Math.round((present / sessions) * 1000) / 10 : null,
        };
      });
    }

    case "grades": {
      const lines = await db.reportCardLine.findMany({
        take: 20000,
        select: {
          caScore: true,
          examScore: true,
          totalScore: true,
          grade: true,
          classAverage: true,
          position: true,
          subject: { select: { name: true } },
          reportCard: {
            select: {
              term: { select: { name: true } },
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
              student: {
                select: {
                  admissionNo: true,
                  firstName: true,
                  lastName: true,
                  otherNames: true,
                },
              },
            },
          },
        },
      });

      return lines.map((line) => ({
        admissionNo: line.reportCard.student.admissionNo,
        name: fullName(line.reportCard.student),
        className: `${line.reportCard.classSection.classLevel.name} ${line.reportCard.classSection.name}`,
        term: line.reportCard.term.name,
        subject: line.subject.name,
        caScore: toNumber(line.caScore),
        examScore: toNumber(line.examScore),
        totalScore: toNumber(line.totalScore),
        grade: line.grade ?? "",
        classAverage: toNumber(line.classAverage),
        position: line.position,
      }));
    }

    case "finance": {
      const invoices = await db.invoice.findMany({
        orderBy: { issueDate: "desc" },
        take: 20000,
        select: {
          invoiceNo: true,
          status: true,
          totalMinor: true,
          paidMinor: true,
          balanceMinor: true,
          dueDate: true,
          term: { select: { name: true } },
          student: {
            select: {
              admissionNo: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              enrollments: {
                where: { status: "ACTIVE" },
                take: 1,
                select: {
                  classSection: {
                    select: { name: true, classLevel: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      });

      const now = Date.now();

      return invoices.map((invoice) => {
        const section = invoice.student.enrollments[0]?.classSection;
        const overdue =
          invoice.dueDate && invoice.balanceMinor > 0
            ? Math.floor((now - invoice.dueDate.getTime()) / 86_400_000)
            : 0;

        return {
          invoiceNo: invoice.invoiceNo,
          name: fullName(invoice.student),
          admissionNo: invoice.student.admissionNo,
          className: section ? `${section.classLevel.name} ${section.name}` : "Unassigned",
          term: invoice.term?.name ?? "",
          status: humanise(invoice.status),
          total: invoice.totalMinor,
          paid: invoice.paidMinor,
          balance: invoice.balanceMinor,
          dueDate: invoice.dueDate?.toISOString() ?? null,
          daysOverdue: overdue > 0 ? overdue : 0,
        };
      });
    }

    case "payments": {
      const payments = await db.payment.findMany({
        orderBy: { paidAt: "desc" },
        take: 20000,
        select: {
          receiptNo: true,
          amountMinor: true,
          channel: true,
          provider: true,
          status: true,
          payerName: true,
          paidAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              otherNames: true,
              enrollments: {
                where: { status: "ACTIVE" },
                take: 1,
                select: {
                  classSection: {
                    select: { name: true, classLevel: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      });

      return payments.map((payment) => {
        const section = payment.student.enrollments[0]?.classSection;
        return {
          receiptNo: payment.receiptNo,
          name: fullName(payment.student),
          className: section ? `${section.classLevel.name} ${section.name}` : "Unassigned",
          amount: payment.amountMinor,
          channel: humanise(payment.channel),
          provider: humanise(payment.provider),
          status: humanise(payment.status),
          payerName: payment.payerName ?? "",
          paidAt: payment.paidAt.toISOString(),
        };
      });
    }

    case "elections": {
      const candidates = await db.candidate.findMany({
        orderBy: { voteCount: "desc" },
        select: {
          displayName: true,
          status: true,
          voteCount: true,
          position: {
            select: {
              title: true,
              election: { select: { title: true } },
              candidates: { select: { voteCount: true } },
            },
          },
        },
      });

      return candidates.map((candidate) => {
        const totalForPosition = candidate.position.candidates.reduce(
          (sum, entry) => sum + entry.voteCount,
          0,
        );
        return {
          election: candidate.position.election.title,
          position: candidate.position.title,
          candidate: candidate.displayName,
          status: humanise(candidate.status),
          votes: candidate.voteCount,
          share: Math.round(percentOf(candidate.voteCount, totalForPosition) * 10) / 10,
        };
      });
    }

    default:
      return [];
  }
}

