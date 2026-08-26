"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoMap, parseWorkbook } from "@/lib/excel";
import { normalisePhone } from "@/lib/utils";

export type ImportState = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  total?: number;
  imported?: number;
  skipped?: number;
  problems?: Array<{ row: number; message: string }>;
  mapped?: Record<string, string>;
  unmatched?: string[];
};

import { IMPORT_FIELDS } from "./fields";

function parseGender(value: string): "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED" {
  const text = value.trim().toLowerCase();
  if (["m", "male", "boy"].includes(text)) return "MALE";
  if (["f", "female", "girl"].includes(text)) return "FEMALE";
  if (text) return "OTHER";
  return "UNDISCLOSED";
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  // Ghanaian spreadsheets commonly carry dd/mm/yyyy, which Date parses as
  // American mm/dd/yyyy and silently gets wrong for the first twelve days of
  // every month, so it is handled explicitly.
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Imports students from a spreadsheet.
 *
 * Defaults to a dry run. A bad import is far harder to undo than to prevent:
 * five hundred half-formed student records with allocated admission numbers
 * cannot be cleanly deleted once invoices and enrolments hang off them.
 */
export async function importStudentsAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  let user;
  try {
    user = await authorize("student.import");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a spreadsheet to import." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "That file is larger than 10 MB. Split it and import in batches." };
  }

  // Two submit buttons rather than a checkbox. The checkbox defaulted to on,
  // so the ordinary way to use this screen was: upload, read "3 rows would
  // import", and find no students afterwards. Nothing errored, nothing was
  // written, and the screen said so in a sentence people had already stopped
  // reading. A button that says "Import for real" cannot be misread, and it
  // submits the form the file is still attached to, so nobody re-picks it.
  const dryRun = formData.get("mode") !== "commit";

  let sheet;
  try {
    sheet = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { error: `Could not read that file: ${(error as Error).message}` };
  }

  if (!sheet.rows.length) return { error: "The first sheet has no data rows." };

  const mapped = autoMap(sheet.headers, IMPORT_FIELDS);
  const unmatched = sheet.headers.filter(
    (header) => !Object.values(mapped).includes(header),
  );

  if (!mapped.firstName || !mapped.lastName) {
    return {
      error:
        "Could not find a first name and last name column. Name them “First name” and “Last name” and try again.",
      unmatched: sheet.headers,
    };
  }

  const problems: Array<{ row: number; message: string }> = [];
  const [sections, currentYear, existing] = await Promise.all([
    db.classSection.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        classLevel: { select: { name: true } },
      },
    }),
    db.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } }),
    db.student.findMany({ select: { admissionNo: true } }),
  ]);

  const takenNumbers = new Set(existing.map((student) => student.admissionNo));
  const sectionByName = new Map<string, string>();
  for (const section of sections) {
    sectionByName.set(section.code.toLowerCase(), section.id);
    sectionByName.set(section.name.toLowerCase(), section.id);
    sectionByName.set(
      `${section.classLevel.name} ${section.name}`.toLowerCase(),
      section.id,
    );
  }

  let imported = 0;
  let skipped = 0;
  let counter = await db.student.count();

  for (const [index, row] of sheet.rows.entries()) {
    const rowNumber = index + 2; // header is row 1
    const get = (field: string) => (mapped[field] ? (row[mapped[field]] ?? "") : "");

    const firstName = get("firstName");
    const lastName = get("lastName");

    if (!firstName || !lastName) {
      problems.push({ row: rowNumber, message: "Missing a first or last name." });
      skipped += 1;
      continue;
    }

    let admissionNo = get("admissionNo");
    if (!admissionNo) {
      counter += 1;
      admissionNo = `ADM/${new Date().getFullYear()}/${String(counter).padStart(4, "0")}`;
    }

    if (takenNumbers.has(admissionNo)) {
      problems.push({
        row: rowNumber,
        message: `Admission number ${admissionNo} already exists: row skipped.`,
      });
      skipped += 1;
      continue;
    }
    takenNumbers.add(admissionNo);

    const className = get("className").toLowerCase();
    const classSectionId = className ? sectionByName.get(className) : undefined;
    if (className && !classSectionId) {
      problems.push({
        row: rowNumber,
        message: `No class matches “${get("className")}”: the student will be created unplaced.`,
      });
    }

    if (dryRun) {
      imported += 1;
      continue;
    }

    try {
      await db.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            admissionNo,
            firstName,
            lastName,
            otherNames: get("otherNames") || null,
            gender: parseGender(get("gender")),
            dateOfBirth: parseDate(get("dateOfBirth")),
            nationality: get("nationality") || "Ghanaian",
            house: get("house") || null,
            phone: normalisePhone(get("phone")),
            email: get("email") || null,
            residentialAddress: get("residentialAddress") || null,
            admissionDate: new Date(),
            admissionType: "NEW",
            status: "ENROLLED",
            createdById: user.id,
          },
        });

        const guardianName = get("guardianName");
        const guardianPhone = normalisePhone(get("guardianPhone"));

        if (guardianName && guardianPhone) {
          const parts = guardianName.split(/\s+/);
          const existingGuardian = await tx.guardian.findFirst({
            where: { phone: guardianPhone },
            select: { id: true },
          });

          const guardian =
            existingGuardian ??
            (await tx.guardian.create({
              data: {
                firstName: parts[0],
                lastName: parts.slice(1).join(" ") || parts[0],
                phone: guardianPhone,
                email: get("guardianEmail") || null,
              },
            }));

          await tx.studentGuardian.create({
            data: {
              studentId: student.id,
              guardianId: guardian.id,
              relation: "GUARDIAN",
              isPrimary: true,
              isEmergency: true,
              isBillPayer: true,
              billSharePercent: 100,
            },
          });
        }

        if (classSectionId && currentYear) {
          await tx.enrollment.create({
            data: {
              studentId: student.id,
              classSectionId,
              academicYearId: currentYear.id,
              status: "ACTIVE",
            },
          });
        }
      });

      imported += 1;
    } catch (error) {
      problems.push({ row: rowNumber, message: (error as Error).message });
      skipped += 1;
    }
  }

  if (!dryRun) {
    await db.dataJob.create({
      data: {
        direction: "IMPORT",
        entity: "students",
        format: "XLSX",
        status: problems.length && !imported ? "FAILED" : "COMPLETED",
        totalRows: sheet.rows.length,
        processedRows: imported + skipped,
        successRows: imported,
        errorRows: skipped,
        errors: problems as never,
        mapping: mapped as never,
        isDryRun: false,
        completedAt: new Date(),
        createdById: user.id,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "student.import",
        summary: `Imported ${imported} students from ${file.name}`,
      },
    });

    revalidatePath("/students");
  }

  return {
    ok: true,
    dryRun,
    total: sheet.rows.length,
    imported,
    skipped,
    problems: problems.slice(0, 50),
    mapped,
    unmatched,
  };
}
