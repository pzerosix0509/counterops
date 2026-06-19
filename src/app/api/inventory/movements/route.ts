import { NextResponse } from "next/server";
import { requireActiveContext } from "@/lib/auth/permissions";
import { listInventoryMovements } from "@/server/queries/inventory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireActiveContext();
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId") ?? ctx.branchId;
  const itemId = url.searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "missing itemId" }, { status: 400 });
  if (branchId !== ctx.branchId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const movements = await listInventoryMovements(branchId, itemId, 50);
  return NextResponse.json({ movements });
}
