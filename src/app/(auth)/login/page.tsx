import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { getCurrentUser, landingPath } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { VENDOR_NAME } from "@/lib/vendor";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(landingPath(user.portal));

  const { next } = await searchParams;
  const school = await db.school
    .findFirst({ select: { name: true, motto: true, logoUrl: true } })
    .catch(() => null);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel — hidden on small screens where it would just push the
          form below the fold. */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "#eef4fb", color: "#1b2b45" }}
      >
        <div className="relative">
          <div className="flex items-center gap-3">
            {school?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logoUrl} alt="" className="size-11 rounded-lg bg-white/10 object-contain p-1" />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
                <GraduationCap className="size-6" />
              </span>
            )}
            <span className="text-lg font-semibold">
              {school?.name ?? "School Management System"}
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {school?.motto ?? "One system for the whole school."}
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "#41536f" }}>
            Admissions and records, attendance and assessment, fees and payments,
            communication, elections and learning: for staff, students and parents.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm" style={{ color: "#2f4262" }}>
            {[
              "Full student profiles",
              "Mobile money & card fees",
              "Terminal report cards",
              "SMS, email & push",
              "AI insights for teaching",
              "Works offline",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/*
          The illustration, blended rather than laid on top.

          It is drawn on pure white, so multiply drops that ground into the
          panel tint and the drawing appears painted onto the panel. Placed as
          an ordinary image it would be a white rectangle with a visible edge,
          and stretched to cover a tall half-screen it would crop straight
          through the desk.

          In the flow rather than positioned behind the text: absolute, it sat
          underneath the copyright line and made both hard to read.

          The panel keeps its light tint in both themes. This is a light
          drawing and there is no dark version of it, so a dark panel would
          leave it floating in a bright rectangle.
        */}
        <div className="relative mt-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/login-illustration.webp"
            alt=""
            className="w-full max-w-lg object-contain mix-blend-multiply"
          />
        </div>

        <p className="relative mt-6 text-xs" style={{ color: "#7c8ba5" }}>
          © {new Date().getFullYear()} {school?.name ?? "School Management System"}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-text)]">
              <GraduationCap className="size-6" />
            </span>
            <p className="text-lg font-semibold">{school?.name ?? "School Management System"}</p>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 mb-7 text-sm text-[var(--text-muted)]">
            Sign in to continue to your portal.
          </p>

          <LoginForm next={next} />

          {env.nodeEnv !== "production" ? (
            <div className="mt-8 rounded-lg border border-dashed border-[var(--border-strong)] p-3 text-xs text-[var(--text-muted)]">
              <p className="mb-1 font-medium text-[var(--text)]">Demo accounts</p>
              <p className="numeric">
                {env.seed.adminEmail} · {env.seed.adminPassword}
              </p>
              <p className="mt-1 text-[var(--text-subtle)]">
                Teacher, bursar, parent and student logins are listed in the seed output.
              </p>
            </div>
          ) : null}

          <p className="mt-8 text-center text-[11px] text-[var(--text-subtle)]">
            Powered by {VENDOR_NAME}
          </p>
        </div>
      </div>
    </div>
  );
}
