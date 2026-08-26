import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { getCurrentUser, landingPath } from "@/lib/auth";
import { db } from "@/lib/db";
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
              <img
                src={school.logoUrl}
                alt=""
                className="size-11 rounded-lg bg-white object-contain p-1 shadow-sm"
              />
            ) : (
              <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
                <GraduationCap className="size-6" />
              </span>
            )}
            <span className="text-lg font-semibold">
              {school?.name ?? "School Management System"}
            </span>
          </div>
        </div>

        {/*
          A greeting, a name and one sentence.

          What stood here was the school's motto, a paragraph naming every
          module, and a six-item feature grid. A sign-in page is not a
          brochure: the person reading it has already chosen this system and is
          trying to get into it, and everything beyond telling them where they
          are is furniture in the way.
        */}
        <div className="relative max-w-md">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "#ffffff", color: "#2f4262" }}
          >
            <span className="size-2 rounded-full bg-[var(--success)]" />
            Welcome back
          </span>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance">
            Sign in to{" "}
            <span style={{ color: "var(--primary)" }}>
              {school?.name ?? "your school"}
            </span>
            .
          </h1>

          <p className="mt-4 text-sm leading-relaxed" style={{ color: "#41536f" }}>
            {school?.motto
              ? `${school.motto}. Pick up where you left off.`
              : "Pick up where you left off."}
          </p>
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

          {/* The greeting is on the panel beside this. Saying "Welcome back"
              in both places reads as a page that has not been proofread. */}
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 mb-7 text-sm text-[var(--text-muted)]">
            Enter your details to continue.
          </p>

          <LoginForm next={next} />

          {/*
            The demo credentials used to be printed here in development: an
            administrator's email address and password, in full, on the sign-in
            page. It was gated on NODE_ENV, which is the right gate and still
            the wrong place to put them. Anyone demonstrating the system from a
            laptop was showing an audience how to sign in as the administrator,
            and a screenshot of the login screen carried the password with it.
            They are printed by the seed, where whoever ran it can read them.
          */}

          <p className="mt-8 text-center text-[11px] text-[var(--text-subtle)]">
            Powered by {VENDOR_NAME}
          </p>
        </div>
      </div>
    </div>
  );
}
