import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import { Card, CardBody, CardHeader, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { navigationFor } from "@/lib/navigation";
import { userCanAny } from "@/lib/auth";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

/**
 * The page the sidebar's help card has always pointed at.
 *
 * It did not exist. The link sat at the foot of every page, for every user,
 * in both portals, and led to the catch-all — which renders a tidy "nothing
 * is served here" rather than an error, so it read as a page that had not
 * been written yet rather than as a broken promise.
 *
 * What a help page for this system can honestly say is: here is what YOU can
 * reach, because that differs by role more than anything else here; here is
 * where the thing you are looking for lives; and here is who to ask, which
 * for a school is a person down the corridor rather than a support desk.
 * Everything below is computed from the viewer's own permissions, so it can
 * never describe a screen they cannot open.
 */
export default async function HelpPage() {
  const user = await requireUser();

  const school = await db.school.findFirst({
    select: {
      name: true,
      email: true,
      phone: true,
      altPhone: true,
      addressLine1: true,
      city: true,
      region: true,
    },
  });

  // The same source the sidebar reads, filtered the same way — so this page
  // and the navigation can never disagree about what the viewer can open.
  const groups = navigationFor(user.portal)
    .map((group) => ({
      label: group.label,
      // An item with no permissions listed is open to everyone in the portal.
      items: group.items.filter((item) => userCanAny(user, item.permissions ?? [])),
    }))
    .filter((group) => group.items.length > 0);

  const contact = [
    school?.phone ? { icon: Phone, label: school.phone, href: `tel:${school.phone}` } : null,
    school?.altPhone
      ? { icon: Phone, label: school.altPhone, href: `tel:${school.altPhone}` }
      : null,
    school?.email ? { icon: Mail, label: school.email, href: `mailto:${school.email}` } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const address = [school?.addressLine1, school?.city, school?.region]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <PageHeader
        title="Help"
        description={`What you can do in ${school?.name ?? "the system"}, and who to ask.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="What you can reach"
              description="Your account, not the system in general: this list is built from your own permissions."
            />
            <CardBody className="space-y-5">
              {groups.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Your account has no sections enabled yet. Ask an administrator to
                  give your role the access your job needs.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <SectionTitle>{group.label}</SectionTitle>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="If something is missing"
              description="Almost always one of these three."
            />
            <CardBody>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-medium">A page is padlocked, or is not in the menu</dt>
                  <dd className="mt-0.5 text-[var(--text-muted)]">
                    Your role does not carry that permission. An administrator can
                    change it under Settings → Users → Roles. Nothing you can do from
                    your own account will open it.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">A class or a pupil you expected is not listed</dt>
                  <dd className="mt-0.5 text-[var(--text-muted)]">
                    Teaching screens show the classes you teach and the register you
                    hold as form teacher: not the whole school. If a class you teach
                    is missing, the subject has not been assigned to you for this
                    term; the office sets that on the Class sections page.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">A figure looks wrong</dt>
                  <dd className="mt-0.5 text-[var(--text-muted)]">
                    Check the term first: most screens show the current term, and a
                    term that has not been marked current makes several pages fall
                    back to showing everything. Say what you saw and on which page
                    when you report it; the exact screen matters more than the number.
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Who to ask" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-[var(--text-muted)]">
                For anything about your access, your marks or a pupil&rsquo;s record,
                the school office is the first stop: not the software.
              </p>
              {contact.map((entry) => (
                <a
                  key={entry.label}
                  href={entry.href}
                  className="flex items-center gap-2 hover:text-[var(--primary)]"
                >
                  <entry.icon className="size-4 shrink-0 text-[var(--text-subtle)]" />
                  <span className="numeric">{entry.label}</span>
                </a>
              ))}
              {address ? (
                <p className="flex items-start gap-2 text-[var(--text-muted)]">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
                  <span>{address}</span>
                </p>
              ) : null}
              {contact.length === 0 && !address ? (
                <p className="text-[var(--text-subtle)]">
                  The school&rsquo;s contact details have not been filled in yet.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your account" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-[var(--text-muted)]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
                <span>
                  Signed in as <strong className="text-[var(--text)]">{user.fullName}</strong>
                  {user.roleNames.length ? `, ${user.roleNames.join(", ")}` : ""}.
                </span>
              </p>
              <p>
                <Link href="/account#password" className="text-[var(--primary)]">
                  Change your password
                </Link>
              </p>
              <p>
                <Link href="/account" className="text-[var(--primary)]">
                  Your profile and signed-in devices
                </Link>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-3 py-4 text-sm text-[var(--text-muted)]">
              <LifeBuoy className="size-5 shrink-0 text-[var(--text-subtle)]" />
              <span>
                This page lists only what your account can open, so it changes when
                your role does.
              </span>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
