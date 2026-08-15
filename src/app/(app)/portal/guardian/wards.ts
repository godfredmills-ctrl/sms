import { db } from "@/lib/db";

/**
 * Every student the signed-in guardian is entitled to see.
 *
 * Guardian pages must scope on this rather than on a student id from the URL:
 * a parent may have several children, and an unscoped lookup would let anyone
 * with a portal login read any student's record by changing the id.
 */
export async function wardIdsFor(guardianId: string): Promise<string[]> {
  const links = await db.studentGuardian.findMany({
    where: { guardianId },
    orderBy: { sortKey: "asc" },
    select: { studentId: true },
  });
  return links.map((link) => link.studentId);
}

export async function wardsFor(guardianId: string) {
  return db.studentGuardian.findMany({
    where: { guardianId },
    orderBy: [{ isPrimary: "desc" }, { sortKey: "asc" }],
    select: {
      relation: true,
      isBillPayer: true,
      receivesReports: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
          photoUrl: true,
          status: true,
          dateOfBirth: true,
          isBoarder: true,
          house: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: {
                  id: true,
                  name: true,
                  classLevel: { select: { name: true } },
                  formTeacher: {
                    select: { firstName: true, lastName: true, title: true, phone: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
