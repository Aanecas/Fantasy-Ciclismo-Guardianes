import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { getUserPicksWide } from "@/server/sheetsFantasy";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const uid = session.user.email;
    const { row } = await getUserPicksWide(uid);
    const riders = row?.riders?.filter((x) => x && x.trim()) ?? [];
    return NextResponse.json({
      ok: true,
      email: uid,
      managerName: row?.managerName ?? "",
      riders,
      spent: row?.spent ?? 0,
      remaining: row?.remaining ?? 0,
      timestamp: row?.timestampIso ?? "",
      locked: row?.locked ?? "",
    });
  } catch (err: any) {
    console.error("GET /api/picks/mine", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "ERROR" }, { status: 500 });
  }
}
