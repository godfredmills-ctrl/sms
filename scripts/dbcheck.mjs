/**
 * Non-destructive connectivity and content check.
 *
 * Reports whether the configured database is reachable and roughly what is in
 * it, so a seed is never run blind against something that already matters.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  await db.$queryRaw`SELECT 1`;

  const [users, students, courses, quizzes] = await Promise.all([
    db.user.count().catch(() => -1),
    db.student.count().catch(() => -1),
    db.course.count().catch(() => -1),
    db.quiz.count().catch(() => -1),
  ]);

  console.log("REACHABLE");
  console.log(`users=${users} students=${students} courses=${courses} quizzes=${quizzes}`);
} catch (error) {
  console.log("UNREACHABLE");
  // Prisma prefixes with the failed invocation, so the useful line is further
  // down — print the first that names an actual cause.
  const line = String(error.message)
    .split("\n")
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry.length > 0 &&
        !entry.startsWith("Invalid `") &&
        !entry.startsWith("await") &&
        !entry.includes("^"),
    );
  console.log(line ?? String(error.message).slice(0, 200));
  console.log("code:", error.code ?? "none");
} finally {
  await db.$disconnect();
}
