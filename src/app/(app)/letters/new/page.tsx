import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";

import { DocumentEditor } from "../editor";
import { peopleForPickers } from "../people";

export const metadata: Metadata = { title: "Write a document" };
export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const user = await requirePermission("letter.write");
  const { staff, students } = await peopleForPickers();

  // The writer's own name and post, offered as the signatory — most documents
  // are signed by whoever wrote them, and re-typing your own job title on
  // every letter is the sort of small friction that ends in it being left off.
  const author = user.staffId
    ? await db.staff.findUnique({
        where: { id: user.staffId },
        select: { firstName: true, lastName: true, jobTitle: true },
      })
    : null;

  return (
    <div>
      <PageHeader
        title="Write a document"
        description="It prints on the school letterhead."
        breadcrumb={
          <Link href="/letters" className="hover:text-[var(--text)]">
            Letters & reports
          </Link>
        }
      />
      <DocumentEditor
        staff={staff}
        students={students}
        canFinalise={userCan(user, "letter.finalise")}
        defaultSignatory={
          author
            ? {
                name: `${author.firstName} ${author.lastName}`,
                title: author.jobTitle ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
