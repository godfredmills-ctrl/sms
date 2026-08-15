import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

import { Badge, Button, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes, humanise } from "@/lib/utils";

import { NotLinked } from "../../../../not-linked";
import { completeLessonAction } from "../../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}): Promise<Metadata> {
  const { lessonId } = await params;
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { title: true },
  });
  return { title: lesson?.title ?? "Lesson" };
}

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="Lesson" />;

  const { courseId, lessonId } = await params;

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      resources: { orderBy: { sortKey: "asc" }, include: { file: true } },
      progress: {
        where: { studentId: user.studentId },
        select: { completedAt: true },
      },
      module: {
        select: {
          id: true,
          title: true,
          courseId: true,
          course: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!lesson || !lesson.isPublished || lesson.module.courseId !== courseId) {
    notFound();
  }

  // Neighbours across the whole course, so "next" crosses a module boundary
  // instead of dead-ending at the last lesson of a module.
  const siblings = await db.lesson.findMany({
    where: { isPublished: true, module: { courseId, isPublished: true } },
    orderBy: [{ module: { sortKey: "asc" } }, { sortKey: "asc" }],
    select: { id: true, title: true },
  });

  const index = siblings.findIndex((entry) => entry.id === lesson.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const isDone = Boolean(lesson.progress[0]?.completedAt);

  return (
    <>
      <PageHeader
        title={lesson.title}
        description={`${lesson.module.course.title} · ${lesson.module.title}`}
        breadcrumb={
          <Link href="/portal/student/courses" className="hover:text-[var(--text)]">
            My courses
          </Link>
        }
        action={
          <>
            <Badge tone="neutral">{humanise(lesson.contentType)}</Badge>
            {lesson.durationMinutes ? (
              <Badge tone="info">{lesson.durationMinutes} min</Badge>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardBody className="space-y-4">
            {lesson.videoUrl ? (
              <div className="aspect-video overflow-hidden rounded-lg bg-black">
                <iframe
                  src={lesson.videoUrl}
                  title={lesson.title}
                  allowFullScreen
                  className="size-full"
                />
              </div>
            ) : null}

            {lesson.content ? (
              <div className="prose-sm max-w-none whitespace-pre-wrap">
                {lesson.content}
              </div>
            ) : null}

            {lesson.externalUrl ? (
              <a
                href={lesson.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
              >
                <ExternalLink className="size-4" />
                Open the linked material
              </a>
            ) : null}

            {!lesson.content && !lesson.videoUrl && !lesson.externalUrl ? (
              <p className="text-sm text-[var(--text-muted)]">
                This lesson has no written content — check the resources panel.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Progress" />
            <CardBody className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">
                {isDone
                  ? "You have marked this lesson complete."
                  : "Mark this complete when you have worked through it."}
              </p>
              <form action={completeLessonAction}>
                <input type="hidden" name="lessonId" value={lesson.id} />
                <input type="hidden" name="courseId" value={courseId} />
                <Button
                  type="submit"
                  variant={isDone ? "outline" : "primary"}
                  size="sm"
                  className="w-full"
                >
                  {isDone ? (
                    <>
                      <RotateCcw className="size-3.5" />
                      Mark as not done
                    </>
                  ) : (
                    <>
                      <CircleCheck className="size-3.5" />
                      Mark complete
                    </>
                  )}
                </Button>
              </form>
            </CardBody>
          </Card>

          {lesson.resources.length ? (
            <Card>
              <CardHeader title="Resources" />
              <ul className="divide-y divide-[var(--border)]">
                {lesson.resources.map((resource) => (
                  <li key={resource.id} className="px-5 py-2.5">
                    {resource.file ? (
                      <a
                        href={`/api/files/${resource.file.id}?download=1`}
                        className="flex items-center gap-2 text-sm hover:text-[var(--primary)]"
                      >
                        <Download className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                        <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                          {formatBytes(resource.file.sizeBytes)}
                        </span>
                      </a>
                    ) : resource.url ? (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm hover:text-[var(--primary)]"
                      >
                        <ExternalLink className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                      </a>
                    ) : (
                      <span className="text-sm">{resource.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="flex gap-2">
            {previous ? (
              <Link
                href={`/portal/student/courses/${courseId}/lessons/${previous.id}`}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Link>
            ) : null}
            {next ? (
              <Link
                href={`/portal/student/courses/${courseId}/lessons/${next.id}`}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium text-white hover:opacity-90"
              >
                Next
                <ChevronRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
