import { Alert, PageHeader } from "@/components/ui";

/**
 * Shown when a signed-in account has no student record attached. It is a real
 * state, not an error: accounts are often created before the office links them.
 */
export function NotLinked({ title = "Student Portal" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Alert tone="warning" title="Account not linked">
        Your login is not yet linked to a student record, so there is nothing to show
        here. Please contact the school office.
      </Alert>
    </>
  );
}
