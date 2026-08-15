import { redirect } from "next/navigation";

import { getCurrentUser, landingPath } from "@/lib/auth";

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? landingPath(user.portal) : "/login");
}
