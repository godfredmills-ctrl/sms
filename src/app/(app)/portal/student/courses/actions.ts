"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Marks a lesson complete for the signed-in student.
 *
 * The student id comes from the session, never from the form: a posted id
 * would let anyone mark progress on someone else's behalf, and completion
 * feeds the teacher's view of who is keeping up.
 */
export async function completeLessonAction(formData: FormData) {
  const user = await authorize("lms.submit");
  if (!user.studentId) return;

  const lessonId = String(formData.get("lessonId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!lessonId) return;

  const existing = await db.lessonProgress.findUnique({
    where: { lessonId_studentId: { lessonId, studentId: user.studentId } },
    select: { completedAt: true },
  });

  const completed = Boolean(existing?.completedAt);

  await db.lessonProgress.upsert({
    where: { lessonId_studentId: { lessonId, studentId: user.studentId } },
    create: {
      lessonId,
      studentId: user.studentId,
      percent: 100,
      completedAt: new Date(),
    },
    update: {
      // Toggling off is deliberate: a student who marked a lesson done by
      // mistake should be able to correct it rather than carry a false record.
      percent: completed ? 0 : 100,
      completedAt: completed ? null : new Date(),
      lastViewedAt: new Date(),
    },
  });

  revalidatePath(`/portal/student/courses/${courseId}/lessons/${lessonId}`);
  revalidatePath("/portal/student/courses");
}
