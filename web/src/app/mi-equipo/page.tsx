"use client";

import { useEffect, useMemo, useState } from "react";

type StartlistRow = {
  Rider: string;
  Team: string;
  Role: string;
  FinalValue: number;
  PCS_Rider_URL: string;
};

type Config = {
  budget: number;
  squadSize: number;
  lockAtIso?: string;
  maxPorEquipo: number;
};

export default function MiEquipoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [config, setConfig] = useState<Config | null>(null);
  const [rows, setRows] = useState<StartlistRow[]>([]);

  const [selected, setSelected] = useState<string[]>([]); // Rider names
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("Todos");
  const [teamFilter, setTeamFilter] = useState<string>("Todos");

  // Carga Config + Startlist + Picks previos del usuario
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [cfgRes, slRes] = await Promise.all([
          fetch("/api/config").then((r) => r.json()),
          fetch("/api/startlist").then((r) => r.json()),
        ]);
        if (!cfgRes?.ok) throw new Error("No pude cargar la configuración");
        if (!slRes?.ok) throw new Error("No pude cargar la startlist");

        setConfig(cfgRes.config);
        setRows(slRes.rows || []);

        // Cargar picks del usuario (si autenticado)
        try {
          const p = await fetch("/api/picks/mine").then((r) => r.json());
          if (p?.ok && Array.isArray(p.picks)) {
            const names = p.picks.map((x: any) => String(x.rider));
            setSelected(names);
          }
        } catch {
          // usuario no autenticado o sin picks: ignoramos
        }

        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Error desconocido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const lockInfo = useMemo(() => {
    if (!config?.lockAtIso) return null;
    const lock = new Date(config.lockAtIso);
    const now = new Date();
    return {
      iso: config.lockAtIso,
      locked: now >= lock,
      localStr: lock.toLocaleString(),
    };
  }, [config]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.Team));
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.Role || "—"));
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !(`${r.Rider} ${r.Team} ${r.Role}`.toLowerCase().includes(ql))) return false;
      if (teamFilter !== "Todos" && r.Team !== teamFilter) return false;
      if (roleFilter !== "Todos" && (r.Role || "—") !== roleFilter) return false;
      return true;
    });
  }, [rows, q, teamFilter, roleFilter]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.includes(r.Rider)),
    [rows, selected]
  );

  const totalValue = useMemo(
    () => selectedRows.reduce((acc, r) => acc + (r.FinalValue || 0), 0),
    [selectedRows]
  );

  const countsByTeam = useMemo(() => {
    const map = new Map<string, number>();
    selectedRows.forEach((r) => map.set(r.Team, (map.get(r.Team) || 0) + 1));
    return map;
  }, [selectedRows]);

  const canSelectMore = config && selected.length < config.squadSize;

  function canToggle(r: StartlistRow) {
    if (!config) return false;
    const already = selected.includes(r.Rider);
    if (already) return true; // deseleccionar siempre

    if (!canSelectMore) return false;
    if (totalValue + (r.FinalValue || 0) > config.budget) return false;
    const t = (countsByTeam.get(r.Team) || 0) + 1;
    if (t > config.maxPorEquipo) return false;
    return true;
  }

  function toggle(r: StartlistRow) {
    if (!canToggle(r)) return;
    setSelected((prev) =>
      prev.includes(r.Rider) ? prev.filter((x) => x !== r.Rider) : [...prev, r.Rider]
    );
  }

  const validToSave = useMemo(() => {
    if (!config) return false;
    if (lockInfo?.locked) return false;
    if (selected.length !== config.squadSize) return false;
    if (totalValue > config.budget) return false;
    for (const [, n] of countsByTeam) {
      if (n > config.maxPorEquipo) return false;
    }
    return true;
  }, [config, lockInfo, selected.length, totalValue, countsByTeam]);

  async function saveTeam() {
    if (!validToSave) return;
    try {
      setSaving(true);
      setNotice(null);
      setError(null);
      const res = await fetch("/api/picks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riders: selected }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "No se pudo guardar");
      }
      setNotice("Equipo guardado con éxito.");
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 4000);
    }
  }

  function resetSelection() {
    setSelected([]);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-10">
        <div className="animate-pulse h-24 rounded-2xl bg-zinc-900/60 border border-zinc-800 mb-6" />
        <div className="grid md:grid-cols-[280px_1fr] gap-6">
          <div className="h-48 rounded-2xl bg-zinc-900/60 border border-zinc-800" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-zinc-900/60 border border-zinc-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="alert alert-error">
          <div>
            <h3 className="font-semibold">Error</h3>
            <p className="opacity-80">{error ?? "Config inválida"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-6">
      {/* Top bar STICKY */}
      <div className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/70 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="kpi">
              Presupuesto:{" "}
              <span className={totalValue > config.budget ? "text-red-400" : ""}>
                {totalValue} / {config.budget}
              </span>
            </div>
            <div className="kpi">
              Corredores:{" "}
              <span className={selected.length > config.squadSize ? "text-red-400" : ""}>
                {selected.length} / {config.squadSize}
              </span>
            </div>
            <div className="kpi">Máx/equipo: {config.maxPorEquipo}</div>
            {lockInfo && (
              <div
                className={`badge ${lockInfo.locked ? "badge-error" : "badge-success"} text-sm`}
                title={lockInfo.iso}
              >
                {lockInfo.locked ? "LOCKED" : `Lock: ${lockInfo.localStr}`}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost"
              onClick={resetSelection}
              disabled={saving || lockInfo?.locked}
            >
              Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={saveTeam}
              disabled={!validToSave || saving}
              title={!validToSave ? "Ajusta selección para cumplir reglas" : "Guardar equipo"}
            >
              {saving ? "Guardando…" : "Guardar equipo"}
            </button>
          </div>
        </div>
        {notice && (
          <div className="text-sm text-emerald-400 mt-2">{notice}</div>
        )}
        {error && (
          <div className="text-sm text-red-400 mt-2">{error}</div>
        )}
      </div>

      {/* Layout: filtros + grid */}
      <div className="grid md:grid-cols-[280px_1fr] gap-6">
        {/* Filtros */}
        <aside className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-5 shadow-xl space-y-4 h-fit sticky top-28">
          <div>
            <label className="text-xs subtle">Buscar</label>
            <input
              className="input input-bordered w-full mt-1"
              placeholder="Nombre, equipo o rol…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs subtle">Rol</label>
            <select
              className="select select-bordered w-full mt-1"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs subtle">Equipo</label>
            <select
              className="select select-bordered w-full mt-1"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-2">
            <button
              className="btn btn-ghost w-full"
              onClick={() => {
                setQ("");
                setRoleFilter("Todos");
                setTeamFilter("Todos");
              }}
            >
              Limpiar filtros
            </button>
          </div>
        </aside>

        {/* Grid corredores */}
        <main>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-400">
              No hay corredores que coincidan con los filtros.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filtered.map((r) => {
                const isSelected = selected.includes(r.Rider);
                const disabled = !isSelected && !canToggle(r);
                return (
                  <article
                    key={r.Rider}
                    className={`card card-hover transition ${
                      isSelected ? "ring-2 ring-brand/70" : ""
                    } ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
                    onClick={() => toggle(r)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold leading-tight">{r.Rider}</h3>
                        <p className="subtle">{r.Team}</p>
                        <p className="text-xs text-zinc-400">{r.Role || "—"}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{r.FinalValue}</div>
                        <a
                          href={r.PCS_Rider_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand underline hover:no-underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          PCS
                        </a>
                      </div>
                    </div>
                    <div className="mt-3">
                      <button
                        className={`btn btn-sm w-full ${
                          isSelected ? "btn-primary" : "btn-ghost"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(r);
                        }}
                      >
                        {isSelected ? "Quitar" : "Añadir"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Barra inferior (seleccionados) */}
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-5 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="text-sm subtle">Seleccionados</div>
          <div className="text-sm text-zinc-400">
            Total: <b>{totalValue}</b> · Corredores: <b>{selected.length}</b> /{" "}
            {config.squadSize}
          </div>
        </div>
        {selectedRows.length === 0 ? (
          <div className="text-zinc-400 text-sm mt-3">Todavía no has elegido nadie.</div>
        ) : (
          <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {selectedRows.map((r) => (
              <li
                key={r.Rider}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.Rider}</div>
                  <div className="text-xs text-zinc-400 truncate">{r.Team}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{r.FinalValue}</span>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() =>
                      setSelected((prev) => prev.filter((x) => x !== r.Rider))
                    }
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
