import { NextResponse } from "next/server";
import { buildVuelta2024StageUrl, fetchStageHTML, parseStageResults } from "@/lib/pcs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const secret = searchParams.get("secret") || "";
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const stageStr = searchParams.get("stage");
    if (!stageStr) {
      return NextResponse.json({ ok: false, error: "stage requerido ?stage=1..21" }, { status: 400 });
    }
    const stage = parseInt(stageStr, 10);
    if (!Number.isFinite(stage) || stage < 1 || stage > 21) {
      return NextResponse.json({ ok: false, error: "stage inválido" }, { status: 400 });
    }

    const url = buildVuelta2024StageUrl(stage);
    const html = await fetchStageHTML(url);
    const rows = parseStageResults(html, stage);

    return NextResponse.json({
      ok: true,
      stage,
      count: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error("GET /api/admin/scrape-stage error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Error" }, { status: 500 });
  }
}
