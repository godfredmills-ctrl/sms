"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui";

/**
 * Printing is a browser action, so this is the one client island on an
 * otherwise server-rendered document. The print stylesheet in globals.css
 * hides the shell and lays the page out for A4.
 */
export function PrintButton({
  label = "Print",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      className={className}
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
