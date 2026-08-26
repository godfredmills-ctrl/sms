import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { LocationForm } from "../categories/setup-forms";

export const metadata: Metadata = { title: "Asset locations" };
export const dynamic = "force-dynamic";

export default async function AssetLocationsPage() {
  await requirePermission("asset.manage");

  const [locations, campuses] = await Promise.all([
    db.assetLocation.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        campus: { select: { name: true } },
        _count: { select: { assets: true } },
      },
    }),
    db.campus.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <Link
        href="/assets"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to the register
      </Link>

      <PageHeader
        title="Asset locations"
        description="Where a thing can be. Named as the person holding a clipboard would say it."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader
                title={location.name}
                description={
                  [location.building, location.room, location.campus?.name]
                    .filter(Boolean)
                    .join(" · ") || "No building or room recorded"
                }
                action={
                  <Badge tone={location.active ? "success" : "neutral"}>
                    {location._count.assets} asset
                    {location._count.assets === 1 ? "" : "s"}
                  </Badge>
                }
              />
              <CardBody>
                <LocationForm
                  campuses={campuses}
                  values={{
                    id: location.id,
                    name: location.name,
                    building: location.building,
                    room: location.room,
                    campusId: location.campusId,
                    sortOrder: location.sortOrder,
                    active: location.active,
                    notes: location.notes,
                  }}
                />
              </CardBody>
            </Card>
          ))}

          {!locations.length ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  No locations yet. Add the first one on the right: an asset can be
                  entered without one, but then nobody knows where to go and look
                  for it.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Add a location"
            description="Two places cannot share a name in the same building: during a stock-take the name is all anybody has to go on."
          />
          <CardBody>
            <LocationForm campuses={campuses} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
