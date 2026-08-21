"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button, Card, CardBody, CardHeader } from "@/components/ui";

import { SessionForm, type TermOption } from "./session-form";

/** The "set up examinations" panel, folded away until it is wanted. */
export function NewSession({ terms }: { terms: TermOption[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Set up examinations
      </Button>
    );
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Set up examinations"
        description="A run of papers over a fortnight, with its own index numbers."
      />
      <CardBody>
        <SessionForm terms={terms} onDone={() => setOpen(false)} />
      </CardBody>
    </Card>
  );
}
