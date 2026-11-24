import { requireStaff } from "@/modules/auth/session";
import { todayInZone } from "@/lib/format";
import { loadReportTables } from "@/modules/reports";
import { paiseToRupees, resolveRange, resolveView, toCsv } from "@/modules/reports/range";

export const dynamic = "force-dynamic";

/** CSV download of the report currently on screen (same tables, plain rupee amounts). */
export async function GET(req: Request) {
  const actor = await requireStaff("FINANCE_VIEW");
  const url = new URL(req.url);
  const view = resolveView(url.searchParams.get("view") ?? undefined);
  const { from, to } = resolveRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined, todayInZone());
  const tables = await loadReportTables(actor, view, from, to, paiseToRupees);
  const csv = tables
    .map((t) => (tables.length > 1 ? `${t.title}\r\n` : "") + toCsv(t.header, [...t.rows, ...(t.totals ? [t.totals] : []), ...(t.notes ?? [])]))
    .join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="physio-central-${view}-wise-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
