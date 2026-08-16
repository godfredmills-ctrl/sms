"use client";

import { useState } from "react";
import { FileText, LayoutTemplate } from "lucide-react";

/**
 * Switches between the readable web view of a credential and the PDF itself.
 *
 * A school that designs a template and then issues a document lands on a page
 * that looks nothing like what they designed, because the web view is a fixed
 * layout and the template only governs the PDF. The honest fix is not to
 * reimplement the template in HTML — that would be a second renderer to keep in
 * step, and it would drift — but to show the actual generated file. What is on
 * screen here is the document, not an impression of it.
 *
 * The frame is only mounted once asked for, so the ordinary case of opening a
 * transcript to read it does not pay for generating a PDF.
 */
export function DocumentView({
  pdfUrl,
  templateName,
  children,
}: {
  pdfUrl: string;
  /** Named so the button says which template is being previewed. */
  templateName: string | null;
  children: React.ReactNode;
}) {
  const [showing, setShowing] = useState(false);

  return (
    <>
      <div className="no-print mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowing(false)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
            showing
              ? "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              : "bg-[var(--primary-soft)] text-[var(--primary)]"
          }`}
        >
          <FileText className="size-3.5" />
          Readable view
        </button>
        <button
          type="button"
          onClick={() => setShowing(true)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
            showing
              ? "bg-[var(--primary-soft)] text-[var(--primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          }`}
        >
          <LayoutTemplate className="size-3.5" />
          {templateName ? `PDF — ${templateName}` : "PDF"}
        </button>
      </div>

      {showing ? (
        <div className="no-print mx-auto max-w-[210mm]">
          <iframe
            src={pdfUrl}
            title="Generated document"
            className="h-[297mm] w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]"
          />
          <p className="mt-2 text-center text-xs text-[var(--text-subtle)]">
            This is the file itself. If your browser will not display PDFs inline,{" "}
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="underline">
              open it in a new tab
            </a>
            .
          </p>
        </div>
      ) : (
        children
      )}
    </>
  );
}
