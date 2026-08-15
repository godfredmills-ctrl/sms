import { db } from "./db";
import { rankDescending, toNumber } from "./utils";

/**
 * Assessment aggregation and report-card generation.
 *
 * The model a Ghanaian school expects: each subject has a continuous
 * assessment (CA) component built from several class tests/projects, plus a
 * terminal exam. Each assessment carries a `weight` (its share of the final
 * subject mark), so a school can run "40% CA / 60% exam" or any other split
 * without code changes.
 */

export type GradeBandLike = {
  grade: string;
  minScore: number;
  maxScore: number;
  point: number | null;
  remark: string | null;
  colour: string | null;
  isPass: boolean;
};

export async function loadGradeScale(scaleId?: string | null) {
  const scale = scaleId
    ? await db.gradeScale.findUnique({
        where: { id: scaleId },
        include: { bands: { orderBy: { sortKey: "asc" } } },
      })
    : await db.gradeScale.findFirst({
        where: { isDefault: true, isActive: true },
        include: { bands: { orderBy: { sortKey: "asc" } } },
      });

  if (!scale) return null;

  return {
    id: scale.id,
    name: scale.name,
    maxPoint: toNumber(scale.maxPoint),
    bands: scale.bands.map<GradeBandLike>((band) => ({
      grade: band.grade,
      minScore: toNumber(band.minScore) ?? 0,
      maxScore: toNumber(band.maxScore) ?? 100,
      point: toNumber(band.point),
      remark: band.remark,
      colour: band.colour,
      isPass: band.isPass,
    })),
  };
}

export function bandFor(bands: GradeBandLike[], score: number | null): GradeBandLike | null {
  if (score === null) return null;
  return (
    bands.find((band) => score >= band.minScore && score <= band.maxScore) ?? null
  );
}

// -----------------------------------------------------------------------------
// Subject aggregation
// -----------------------------------------------------------------------------

export type SubjectResult = {
  subjectId: string;
  subjectName: string;
  caScore: number | null;
  examScore: number | null;
  totalScore: number | null;
  teacherName: string | null;
  excludeFromAggregate: boolean;
  breakdown: Array<{
    title: string;
    category: string;
    score: number | null;
    maxScore: number;
    weight: number;
    isExam: boolean;
    isAbsent: boolean;
  }>;
};

/**
 * Computes each student's subject totals for a class section in a term.
 * Returns a map keyed by student id so positions can be ranked afterwards.
 */
export async function computeSubjectResults(
  classSectionId: string,
  termId: string,
): Promise<Map<string, SubjectResult[]>> {
  const offerings = await db.subjectOffering.findMany({
    where: { classSectionId, termId },
    select: {
      subject: {
        select: { id: true, name: true, excludeFromAggregate: true, sortKey: true },
      },
      teacher: { select: { title: true, firstName: true, lastName: true } },
      assessments: {
        where: { isPublished: true },
        select: {
          title: true,
          category: true,
          maxScore: true,
          weight: true,
          isExam: true,
          scores: {
            select: { studentId: true, score: true, isAbsent: true, isExempt: true },
          },
        },
      },
    },
  });

  const perStudent = new Map<string, SubjectResult[]>();

  for (const offering of offerings) {
    const teacherName = offering.teacher
      ? [offering.teacher.title, offering.teacher.firstName, offering.teacher.lastName]
          .filter(Boolean)
          .join(" ")
      : null;

    // Collect every student who has a score in this subject.
    const studentIds = new Set<string>();
    for (const assessment of offering.assessments) {
      for (const score of assessment.scores) studentIds.add(score.studentId);
    }

    for (const studentId of studentIds) {
      const breakdown: SubjectResult["breakdown"] = [];
      let caWeighted = 0;
      let caWeightUsed = 0;
      let examWeighted = 0;
      let examWeightUsed = 0;

      for (const assessment of offering.assessments) {
        const record = assessment.scores.find((score) => score.studentId === studentId);
        if (!record || record.isExempt) continue;

        const maxScore = toNumber(assessment.maxScore) ?? 100;
        const weight = toNumber(assessment.weight) ?? 0;
        const raw = record.isAbsent ? 0 : (toNumber(record.score) ?? 0);
        const percent = maxScore > 0 ? (raw / maxScore) * 100 : 0;

        breakdown.push({
          title: assessment.title,
          category: assessment.category,
          score: record.isAbsent ? null : (toNumber(record.score) ?? null),
          maxScore,
          weight,
          isExam: assessment.isExam,
          isAbsent: record.isAbsent,
        });

        if (weight <= 0) continue;

        if (assessment.isExam) {
          examWeighted += (percent * weight) / 100;
          examWeightUsed += weight;
        } else {
          caWeighted += (percent * weight) / 100;
          caWeightUsed += weight;
        }
      }

      // Only count components that actually exist, so a term with no exam yet
      // still produces a meaningful CA-only mark.
      const hasAny = caWeightUsed + examWeightUsed > 0;
      const totalScore = hasAny
        ? round1(((caWeighted + examWeighted) / (caWeightUsed + examWeightUsed)) * 100)
        : null;

      const results = perStudent.get(studentId) ?? [];
      results.push({
        subjectId: offering.subject.id,
        subjectName: offering.subject.name,
        caScore: caWeightUsed > 0 ? round1(caWeighted) : null,
        examScore: examWeightUsed > 0 ? round1(examWeighted) : null,
        totalScore,
        teacherName,
        excludeFromAggregate: offering.subject.excludeFromAggregate,
        breakdown,
      });
      perStudent.set(studentId, results);
    }
  }

  return perStudent;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// -----------------------------------------------------------------------------
// Report cards
// -----------------------------------------------------------------------------

export type GenerateReportsResult = {
  generated: number;
  skipped: number;
  errors: string[];
};

/**
 * Builds (or rebuilds) report cards for a whole class in one pass, so class
 * positions, subject positions and class averages are all consistent.
 * Published report cards are left alone unless `overwrite` is set.
 */
export async function generateClassReportCards(options: {
  classSectionId: string;
  termId: string;
  gradeScaleId?: string | null;
  overwrite?: boolean;
}): Promise<GenerateReportsResult> {
  const result: GenerateReportsResult = { generated: 0, skipped: 0, errors: [] };

  const [section, term, scale] = await Promise.all([
    db.classSection.findUnique({
      where: { id: options.classSectionId },
      select: {
        id: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: {
            studentId: true,
            academicYearId: true,
          },
        },
      },
    }),
    db.term.findUnique({
      where: { id: options.termId },
      select: { id: true, academicYearId: true, endDate: true },
    }),
    loadGradeScale(options.gradeScaleId),
  ]);

  if (!section) {
    result.errors.push("Class section not found.");
    return result;
  }
  if (!term) {
    result.errors.push("Term not found.");
    return result;
  }

  const resultsByStudent = await computeSubjectResults(options.classSectionId, options.termId);
  const enrolledIds = section.enrollments.map((enrollment) => enrollment.studentId);
  const classSize = enrolledIds.length;

  // Attendance totals for the term, per student.
  const attendance = await db.attendanceRecord.groupBy({
    by: ["studentId", "status"],
    where: { session: { termId: options.termId }, studentId: { in: enrolledIds } },
    _count: { _all: true },
  });

  const attendanceByStudent = new Map<
    string,
    { present: number; absent: number; late: number; total: number }
  >();
  for (const row of attendance) {
    const entry =
      attendanceByStudent.get(row.studentId) ??
      { present: 0, absent: 0, late: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === "PRESENT") entry.present += row._count._all;
    else if (row.status === "ABSENT") entry.absent += row._count._all;
    else if (row.status === "LATE") {
      entry.late += row._count._all;
      entry.present += row._count._all;
    } else if (row.status === "HALF_DAY" || row.status === "EXCUSED") {
      entry.present += row._count._all;
    }
    attendanceByStudent.set(row.studentId, entry);
  }

  // --- Class-level statistics per subject ----------------------------------
  const subjectStats = new Map<
    string,
    { scores: Array<{ studentId: string; score: number }>; }
  >();

  for (const [studentId, subjects] of resultsByStudent) {
    if (!enrolledIds.includes(studentId)) continue;
    for (const subject of subjects) {
      if (subject.totalScore === null) continue;
      const entry = subjectStats.get(subject.subjectId) ?? { scores: [] };
      entry.scores.push({ studentId, score: subject.totalScore });
      subjectStats.set(subject.subjectId, entry);
    }
  }

  const subjectPositions = new Map<string, Map<string, number>>();
  const subjectSummary = new Map<
    string,
    { average: number; highest: number; lowest: number }
  >();

  for (const [subjectId, entry] of subjectStats) {
    const positions = rankDescending(entry.scores, (row) => row.score);
    const map = new Map<string, number>();
    for (const [row, position] of positions) map.set(row.studentId, position);
    subjectPositions.set(subjectId, map);

    const values = entry.scores.map((row) => row.score);
    subjectSummary.set(subjectId, {
      average: round1(values.reduce((a, b) => a + b, 0) / values.length),
      highest: Math.max(...values),
      lowest: Math.min(...values),
    });
  }

  // --- Overall averages and class positions --------------------------------
  const overall: Array<{ studentId: string; average: number }> = [];
  for (const studentId of enrolledIds) {
    const subjects = (resultsByStudent.get(studentId) ?? []).filter(
      (subject) => !subject.excludeFromAggregate && subject.totalScore !== null,
    );
    if (!subjects.length) continue;
    const average =
      subjects.reduce((sum, subject) => sum + (subject.totalScore ?? 0), 0) /
      subjects.length;
    overall.push({ studentId, average: round1(average) });
  }

  const classPositions = new Map<string, number>();
  for (const [row, position] of rankDescending(overall, (entry) => entry.average)) {
    classPositions.set(row.studentId, position);
  }

  // --- Persist --------------------------------------------------------------
  for (const studentId of enrolledIds) {
    const subjects = resultsByStudent.get(studentId) ?? [];
    if (!subjects.length) {
      result.skipped += 1;
      continue;
    }

    const existing = await db.reportCard.findUnique({
      where: { studentId_termId: { studentId, termId: options.termId } },
      select: { id: true, status: true },
    });

    if (existing && existing.status === "PUBLISHED" && !options.overwrite) {
      result.skipped += 1;
      continue;
    }

    const summary = overall.find((entry) => entry.studentId === studentId);
    const averageScore = summary?.average ?? null;
    const overallBand = scale ? bandFor(scale.bands, averageScore) : null;
    const att = attendanceByStudent.get(studentId);

    // GPA across counted subjects, when the scale defines points.
    const points = subjects
      .filter((subject) => !subject.excludeFromAggregate)
      .map((subject) => bandFor(scale?.bands ?? [], subject.totalScore)?.point ?? null)
      .filter((point): point is number => point !== null);
    const gpa = points.length
      ? Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100) / 100
      : null;

    // WASSCE-style aggregate: sum the best six grade points (lower is better).
    const aggregate =
      points.length >= 6
        ? [...points].sort((a, b) => a - b).slice(0, 6).reduce((a, b) => a + b, 0)
        : null;

    const lines = subjects.map((subject, index) => {
      const band = scale ? bandFor(scale.bands, subject.totalScore) : null;
      const stats = subjectSummary.get(subject.subjectId);
      return {
        subjectId: subject.subjectId,
        caScore: subject.caScore,
        examScore: subject.examScore,
        totalScore: subject.totalScore,
        grade: band?.grade ?? null,
        point: band?.point ?? null,
        position: subjectPositions.get(subject.subjectId)?.get(studentId) ?? null,
        classAverage: stats?.average ?? null,
        highestScore: stats?.highest ?? null,
        lowestScore: stats?.lowest ?? null,
        remark: band?.remark ?? null,
        teacherName: subject.teacherName,
        breakdown: subject.breakdown as never,
        sortKey: index,
      };
    });

    try {
      const data = {
        studentId,
        termId: options.termId,
        academicYearId: term.academicYearId,
        classSectionId: options.classSectionId,
        gradeScaleId: scale?.id ?? null,
        totalScore: subjects.reduce((sum, subject) => sum + (subject.totalScore ?? 0), 0),
        averageScore,
        gpa,
        aggregate,
        overallGrade: overallBand?.grade ?? null,
        positionInClass: classPositions.get(studentId) ?? null,
        classSize,
        daysPresent: att?.present ?? null,
        daysAbsent: att?.absent ?? null,
        daysLate: att?.late ?? null,
        totalSchoolDays: att?.total ?? null,
      };

      if (existing) {
        await db.$transaction([
          db.reportCardLine.deleteMany({ where: { reportCardId: existing.id } }),
          db.reportCard.update({
            where: { id: existing.id },
            data: { ...data, status: "DRAFT", lines: { create: lines } },
          }),
        ]);
      } else {
        await db.reportCard.create({ data: { ...data, lines: { create: lines } } });
      }

      result.generated += 1;
    } catch (error) {
      result.errors.push(`${studentId}: ${(error as Error).message}`);
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Transcript assembly
// -----------------------------------------------------------------------------

/**
 * Gathers a student's complete academic record across every term, ready to be
 * frozen into a Transcript snapshot.
 */
export async function buildTranscriptData(studentId: string) {
  const [student, reports] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: {
        admissionNo: true,
        indexNumber: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        dateOfBirth: true,
        gender: true,
        nationality: true,
        admissionDate: true,
        exitDate: true,
        photoUrl: true,
      },
    }),
    db.reportCard.findMany({
      where: { studentId, status: { in: ["APPROVED", "PUBLISHED"] } },
      orderBy: [{ academicYear: { startDate: "asc" } }, { term: { sequence: "asc" } }],
      select: {
        averageScore: true,
        gpa: true,
        positionInClass: true,
        classSize: true,
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        lines: {
          orderBy: { sortKey: "asc" },
          select: {
            totalScore: true,
            grade: true,
            point: true,
            remark: true,
            subject: { select: { id: true, name: true, creditHours: true } },
          },
        },
      },
    }),
  ]);

  if (!student) return null;

  const allPoints: number[] = [];
  let totalCredits = 0;

  const terms = reports.map((report) => {
    const lines = report.lines.map((line) => {
      const point = toNumber(line.point);
      const credits = toNumber(line.subject.creditHours) ?? 0;
      if (point !== null) allPoints.push(point);
      totalCredits += credits;
      return {
        subjectId: line.subject.id,
        subjectName: line.subject.name,
        score: toNumber(line.totalScore),
        grade: line.grade,
        point,
        credits,
        remark: line.remark,
      };
    });

    return {
      academicYear: report.academicYear.name,
      termName: report.term.name,
      className: `${report.classSection.classLevel.name} ${report.classSection.name}`,
      average: toNumber(report.averageScore),
      gpa: toNumber(report.gpa),
      position: report.positionInClass,
      classSize: report.classSize,
      lines,
    };
  });

  const cumulativeGpa = allPoints.length
    ? Math.round((allPoints.reduce((a, b) => a + b, 0) / allPoints.length) * 100) / 100
    : null;

  return {
    student: {
      ...student,
      fullName: [student.firstName, student.otherNames, student.lastName]
        .filter(Boolean)
        .join(" "),
    },
    terms,
    cumulativeGpa,
    totalCredits,
  };
}
