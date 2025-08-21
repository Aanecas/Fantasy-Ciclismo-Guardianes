import { NextResponse } from "next/server";
import { getStartlist } from "@/server/sheetsFantasy";

export async function GET() {
  try {
    const rows = await getStartlist();
    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("GET /api/startlist", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "ERROR" }, { status: 500 });
  }
}
