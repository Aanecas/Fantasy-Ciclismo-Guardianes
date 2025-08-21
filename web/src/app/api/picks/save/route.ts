import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { getConfig, getStartlist, upsertUserPicksWide } from "@/server/sheetsFantasy";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const email = session.user.email;
    const managerName = session.user.name || email;

    const body = await req.json();
    const riders: string[] = Array.isArray(body?.riders) ? body.riders : [];

    const [cfg, startlist] = await Promise.all([getConfig(), getStartlist()]);

    // Lock
    if (cfg.lockAtIso) {
      const lockDate = new Date(cfg.lockAtIso);
      if (new Date() >= lockDate) {
        return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
      }
    }

    // Mapear y validar
    const byName = new Map(startlist.map(r => [r.Rider, r]));
    const selectedRows = riders.map(r => byName.get(r)).filter(Boolean) as typeof startlist;

    if (selectedRows.length !== cfg.squadSize) {
      return NextResponse.json({ ok: false, error: `SQUAD_SIZE: necesitas ${cfg.squadSize}` }, { status: 400 });
    }

    const spent = selectedRows.reduce((acc, r) => acc + (r.FinalValue || 0), 0);
    if (spent > cfg.budget) {
      return NextResponse.json({ ok: false, error: "BUDGET_EXCEEDED" }, { status: 400 });
    }

    const countByTeam = selectedRows.reduce((m, r) => (m.set(r.Team, (m.get(r.Team) || 0) + 1), m), new Map<string, number>());
    for (const [, n] of countByTeam) {
      if (n > cfg.maxPorEquipo) {
        return NextResponse.json({ ok: false, error: "MAX_POR_EQUIPO_EXCEEDED" }, { status: 400 });
      }
    }

    const remaining = cfg.budget - spent;

    // Guardar en formato ancho
    await upsertUserPicksWide({
      email,
      managerName,
      riders,        // nombres exactos; se rellenan Rider1..Rider8
      spent,
      remaining,
    });

    return NextResponse.json({ ok: true, saved: riders.length, spent, remaining });
  } catch (err: any) {
    console.error("POST /api/picks/save", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "ERROR" }, { status: 500 });
  }
}
