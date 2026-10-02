import { prisma } from "@/shared/db/prisma";

/** Liveness + database connectivity check (no data returned). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}

export const dynamic = "force-dynamic";
