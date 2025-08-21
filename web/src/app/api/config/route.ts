import { NextResponse } from "next/server";
import { getConfig } from "@/server/sheetsFantasy";

export async function GET() {
  try {
    const cfg = await getConfig();
    return NextResponse.json({ ok: true, config: cfg });
  } catch (err: any) {
    console.error("GET /api/config", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "ERROR" }, { status: 500 });
  }
}
