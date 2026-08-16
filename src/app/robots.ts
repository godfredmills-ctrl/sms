import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Crawlers get the public website and nothing else. Everything under the
 * application — portals, records, files — is authenticated anyway, but saying
 * so here keeps crawlers from hammering the login redirect and keeps
 * authenticated URLs out of "we found this link" listings.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/site", "/verify"],
        disallow: ["/"],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
