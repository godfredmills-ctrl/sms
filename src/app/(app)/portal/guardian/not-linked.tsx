import { Alert, PageHeader } from "@/components/ui";

export function NotLinked({ title = "Parent Portal" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Alert tone="warning" title="Account not linked">
        Your login is not yet connected to a guardian record, so there are no children
        attached to it. Please contact the school office.
      </Alert>
    </>
  );
}
