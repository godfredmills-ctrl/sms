"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { courseOutOfScope, offeringOutOfScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { generateCode } from "@/lib/crypto";
import { slugify } from "@/lib/utils";

export type LmsState = { ok?: boolean; error?: string; message?: string; id?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createCourseAction(
  _previous: LmsState,
  formData: FormData,
): Promise<LmsState> {
  let user;
  try {
    user = await authorize("lms.course.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const title = text(formData, "title");
  if (!title) return { error: "Give the course a title." };

  const offeringId = text(formData, "offeringId") || null;

  // A course mirrors at most one subject offering. Two courses on the same
  // offering would split a class's material in half without anyone noticing.
  if (offeringId) {
    const taken = await db.course.findUnique({
      where: { offeringId },
      select: { title: true },
    });
    if (taken) {
      return { error: `That class already has a course: "${taken.title}".` };
    }
  }

  const code =
    text(formData, "code").toUpperCase() ||
    `${slugify(title).toUpperCase().replace(/-/g, "").slice(0, 8)}-${generateCode(3)}`;

  if (await db.course.findUnique({ where: { code } })) {
    return { error: `A course with code "${code}" already exists.` };
  }

  const course = await db.course.create({
    data: {
      title,
      code,
      description: text(formData, "description") || null,
      offeringId,
      isSelfPaced: formData.get("isSelfPaced") === "on",
      allowDiscussion: formData.get("allowDiscussion") === "on",
      enforceSequence: formData.get("enforceSequence") === "on",
      syllabus: text(formData, "syllabus") || null,
      status: "DRAFT",
      createdById: user.id,
    },
  });

  revalidatePath("/lms");
  return { ok: true, id: course.id, message: `Created "${title}" as a draft.` };
}

export async function toggleCoursePublishedAction(formData: FormData) {
  const user = await authorize("lms.course.manage");

  const id = text(formData, "id");
  // Publishing a course puts it in front of a class; withdrawing one takes
  // the material away mid-term. Both belong to whoever teaches it.
  if (await courseOutOfScope(user, id)) return;
  if (!id) return;

  const course = await db.course.findUnique({
    where: { id },
    select: {
      status: true,
      title: true,
      modules: { where: { isPublished: true }, select: { id: true } },
    },
  });
  if (!course) return;

  // Publishing an empty course puts a subject in front of students with
  // nothing behind it, which reads as the system being broken.
  if (course.status !== "PUBLISHED" && course.modules.length === 0) return;

  const next = course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
  await db.course.update({ where: { id }, data: { status: next } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: next === "PUBLISHED" ? "lms.course.publish" : "lms.course.unpublish",
      entity: "Course",
      entityId: id,
      summary: `${next === "PUBLISHED" ? "Published" : "Withdrew"} ${course.title}`,
    },
  });

  revalidatePath("/lms");
}

export async function createModuleAction(formData: FormData) {
  const user = await authorize("lms.course.manage");

  const courseId = text(formData, "courseId");
  if (await courseOutOfScope(user, courseId)) return;
  const title = text(formData, "title");
  if (!courseId || !title) return;

  const last = await db.courseModule.findFirst({
    where: { courseId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.courseModule.create({
    data: {
      courseId,
      title,
      description: text(formData, "description") || null,
      sortKey: (last?.sortKey ?? 0) + 10,
      isPublished: true,
    },
  });

  revalidatePath(`/lms/${courseId}`);
}

export async function createLessonAction(formData: FormData) {
  const user = await authorize("lms.course.manage");

  const moduleId = text(formData, "moduleId");
  const courseId = text(formData, "courseId");
  const title = text(formData, "title");
  if (!moduleId || !title) return;

  // Every other write in this module asks courseOutOfScope; this one did not,
  // so lms.course.manage — which every teacher holds — let a lesson be posted
  // into any course in the school by supplying another module's id. The
  // module is resolved to its own course rather than trusting the courseId
  // the form also carries, since the two are separate fields and only the
  // module decides where the lesson actually lands.
  const owningModule = await db.courseModule.findUnique({
    where: { id: moduleId },
    select: { courseId: true },
  });
  if (!owningModule) return;
  if (await courseOutOfScope(user, owningModule.courseId)) return;

  const last = await db.lesson.findFirst({
    where: { moduleId },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  const duration = Number(text(formData, "durationMinutes"));

  await db.lesson.create({
    data: {
      moduleId,
      title,
      contentType: text(formData, "contentType") || "TEXT",
      content: text(formData, "content") || null,
      videoUrl: text(formData, "videoUrl") || null,
      externalUrl: text(formData, "externalUrl") || null,
      durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : null,
      sortKey: (last?.sortKey ?? 0) + 10,
      isPublished: formData.get("isPublished") === "on",
    },
  });

  revalidatePath(`/lms/${courseId}`);
}

export async function toggleLessonPublishedAction(formData: FormData) {
  const user = await authorize("lms.course.manage");

  const id = text(formData, "id");
  const courseId = text(formData, "courseId");
  if (await courseOutOfScope(user, courseId)) return;
  if (!id) return;

  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { isPublished: true },
  });
  if (!lesson) return;

  await db.lesson.update({
    where: { id },
    data: { isPublished: !lesson.isPublished },
  });

  revalidatePath(`/lms/${courseId}`);
}

export async function createAssignmentAction(formData: FormData) {
  const user = await authorize("lms.assignment.manage");

  const courseId = text(formData, "courseId");
  // Homework is set for a class by the person who teaches it.
  if (await courseOutOfScope(user, courseId)) return;
  const title = text(formData, "title");
  if (!courseId || !title) return;

  const dueAt = text(formData, "dueAt");
  const maxScore = Number(text(formData, "maxScore"));

  await db.assignment.create({
    data: {
      courseId,
      title,
      instructions: text(formData, "instructions") || null,
      type: (text(formData, "type") || "FILE_UPLOAD") as never,
      maxScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 100,
      dueAt: dueAt ? new Date(dueAt) : null,
      allowLate: formData.get("allowLate") === "on",
      latePenaltyPercent: Number(text(formData, "latePenaltyPercent")) || 0,
      isPublished: formData.get("isPublished") === "on",
      createdById: user.id,
    },
  });

  revalidatePath(`/lms/${courseId}`);
}

export async function gradeSubmissionAction(formData: FormData) {
  const user = await authorize("lms.assignment.manage");

  const id = text(formData, "id");
  const courseId = text(formData, "courseId");
  // A mark on a child's work, written by the teacher whose course it is.
  if (await courseOutOfScope(user, courseId)) return;
  if (!id) return;

  const score = Number(text(formData, "score"));
  if (!Number.isFinite(score)) return;

  const submission = await db.submission.findUnique({
    where: { id },
    select: { assignment: { select: { maxScore: true } } },
  });
  if (!submission) return;

  // A mark above the maximum is always a slip, and it silently corrupts every
  // average built on top of it.
  const max = Number(submission.assignment.maxScore);
  if (score < 0 || score > max) return;

  await db.submission.update({
    where: { id },
    data: {
      score,
      feedback: text(formData, "feedback") || null,
      status: "GRADED",
      gradedById: user.id,
      gradedAt: new Date(),
      returnedAt: new Date(),
    },
  });

  revalidatePath(`/lms/${courseId}`);
}
