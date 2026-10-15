import { redirect } from "next/navigation";
import { buildRedirectTarget, serializeSearchParams } from "@/lib/admin/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyRedirectPage({ searchParams }) {
  const sp = await searchParams;
  const queryString = sp ? serializeSearchParams(sp) : "";
  redirect(buildRedirectTarget("/admin/system?tab=email", queryString));
}
