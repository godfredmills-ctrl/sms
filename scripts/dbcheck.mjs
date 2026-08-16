/**
 * Non-destructive connectivity and content check.
 *
 * Reports whether the configured database is reachable and roughly what is in
 * it, so a seed is never run blind against something that already matters.
 */
import { PrismaClient } from "@prisma/client";

// Load .env when running locally. On a platform the variables are already in
// the environment, and there is no file — hence the catch. Node's own loader
// is used rather than dotenv, which this project does not actually depend on;
// relying on a transitive copy would make this script fail for a reason that
// has nothing to do with the database.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env, or an older Node without loadEnvFile. Either is fine.
}

if (!process.env.DATABASE_URL) {
  console.log("UNREACHABLE");
  console.log("DATABASE_URL is not set.");
  process.exit(0);
}

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
