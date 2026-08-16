import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Verify a document" };

/**
 * The typed-code entrance to verification.
 *
 * The QR on a certificate goes straight to /verify/<code>; this page is for
 * the person holding a photocopy, where the printed code is all that
 * survived. Public by design — the whole point is that a stranger can check.
 */
export default function VerifyIndexPage() {
  async function lookup(formData: FormData) {
    "use server";
    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase()
      // Stored codes are bare alphanumerics; people add grouping hyphens
      // when reading them out, and the lookup must not punish that.
      .replace(/[^A-Z0-9]/g, "");
    if (code) redirect(`/verify/${code}`);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Verify a document</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the verification code printed on the certificate or transcript.
        </p>

        <form action={lookup} className="mt-5 space-y-3">
          <input
            name="code"
            required
            autoFocus
            placeholder="K3M9-2QX7"
            className="numeric h-11 w-full rounded-lg border border-slate-300 px-3 text-center text-lg tracking-widest uppercase outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Check it
          </button>
        </form>
      </div>
    </div>
  );
}
