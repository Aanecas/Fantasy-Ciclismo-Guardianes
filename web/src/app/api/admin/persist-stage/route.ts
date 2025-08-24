// src/app/api/admin/persist-stage/route.ts
import { NextResponse } from "next/server";
import { persistStageToResultsRaw } from "@/server/sheetsPCS";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "Guardianessobreruedas";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret") || "";
    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const stageStr = searchParams.get("stage") || "";
    const stage = parseInt(stageStr, 10) || 0;
    if (!stage) {
      return NextResponse.json({ ok: false, error: "Missing 'stage' param" }, { status: 400 });
    }

    const res = await persistStageToResultsRaw(stage);
    return NextResponse.json(res);
  } catch (err: any) {
    console.error("GET /api/admin/persist-stage", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
