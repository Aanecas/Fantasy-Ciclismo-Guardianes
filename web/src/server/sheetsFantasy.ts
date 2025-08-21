// web/src/server/sheetsFantasy.ts
import { sheetsClient } from "./sheets";

const SHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const TAB_STARTLIST = process.env.GOOGLE_SHEETS_STARTLIST_TAB || "Startlist";
const TAB_PICKS = process.env.GOOGLE_SHEETS_PICKS_TAB || "Picks";
const TAB_CONFIG = process.env.GOOGLE_SHEETS_CONFIG_TAB || "Config";

export type StartlistRow = {
  Rider: string;
  Team: string;
  Role: string;
  FinalValue: number;
  PCS_Rider_URL: string;
};

export async function getConfig() {
  const sheets = await sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_CONFIG}!A:B`,
  });
  const rows = res.data.values || [];
  // Espera cabeceras en fila 1 (A|B) y datos desde fila 2:
  // BUDGET | 2000, SQUAD_SIZE | 8, MAX_POR_EQUIPO | 3, LOCK_AT_ISO | 2025-...
  const map = new Map(rows.slice(1).map(([k, v]) => [String(k).trim(), String(v ?? "").trim()]));

  return {
    budget: Number(map.get("BUDGET")) || Number(process.env.FANTASY_BUDGET) || 2000,
    squadSize: Number(map.get("SQUAD_SIZE")) || Number(process.env.FANTASY_SQUAD_SIZE) || 8,
    lockAtIso: map.get("LOCK_AT_ISO") || process.env.FANTASY_LOCK_AT_ISO || "",
    maxPorEquipo: Number(map.get("MAX_POR_EQUIPO")) || Number(process.env.FANTASY_MAX_POR_EQUIPO) || 3,
  };
}

export async function getStartlist(): Promise<StartlistRow[]> {
  const sheets = await sheetsClient();
  // Leemos muchas columnas y mapeamos por cabecera para no depender del orden exacto
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_STARTLIST}!A:Z`,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h).trim());
  const idx = (name: string) => headers.indexOf(name);

  const iRider = idx("Rider");
  const iTeam = idx("Team");
  const iRole = idx("Role");
  const iFinal = idx("FinalValue");
  const iUrl = idx("PCS_Rider_URL");

  return rows.slice(1).map((r) => ({
    Rider: String(r[iRider] ?? ""),
    Team: String(r[iTeam] ?? ""),
    Role: String(r[iRole] ?? ""),
    FinalValue: Number(r[iFinal] ?? 0) || 0,
    PCS_Rider_URL: String(r[iUrl] ?? ""),
  })).filter(r => r.Rider); // descarta vacíos
}

export async function getUserPicks(uid: string) {
  const sheets = await sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A:H`,
  });
  const rows = res.data.values || [];
  const headers = rows[0] || ["uid","rider","team","role","FinalValue","pcs_url","created_at","updated_at"];
  const data = rows.slice(1)
    .filter((r) => r[0] === uid)
    .map((r) => ({
      uid: r[0],
      rider: r[1],
      team: r[2],
      role: r[3],
      FinalValue: Number(r[4] || 0),
      pcs_url: r[5],
      created_at: r[6],
      updated_at: r[7],
    }));
  return { headers, data };
}

export async function replaceUserPicks(uid: string, picks: Array<{
  rider: string; team: string; role: string; FinalValue: number; pcs_url: string;
}>) {
  const sheets = await sheetsClient();

  // 1) Lee todo para filtrar las filas del usuario
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A:H`,
  });
  const all = res.data.values || [];
  const header = all[0] || ["uid","rider","team","role","FinalValue","pcs_url","created_at","updated_at"];
  const body = all.slice(1);

  const now = new Date().toISOString();
  const remaining = body.filter((r) => r[0] !== uid);
  const newRows = picks.map((p) => [uid, p.rider, p.team, p.role, p.FinalValue, p.pcs_url, now, now]);

  const next = [header, ...remaining, ...newRows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A1:H${next.length}`,
    valueInputOption: "RAW",
    requestBody: { values: next },
  });

  return { saved: picks.length };
}
// --- NUEVO BLOQUE PARA FORMATO "ANCHO" EN 'Picks' ---

type WidePicksRow = {
  email: string;
  managerName: string;
  riders: string[];        // Hasta 8
  spent: number;
  remaining: number;
  timestampIso: string;
  locked?: string;
};

function padTo<T>(arr: T[], len: number, fill: T): T[] {
  const out = arr.slice(0, len);
  while (out.length < len) out.push(fill);
  return out;
}

/**
 * Lee la fila (formato ancho) del usuario en la pestaña Picks.
 * Estructura esperada de cabecera:
 * Email | ManagerName | Rider1 | ... | Rider8 | Spent | Remaining | Timestamp | Locked
 */
export async function getUserPicksWide(uid: string) {
  const sheets = await sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A:N`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) {
    return { header: [], row: null as WidePicksRow | null };
  }
  const header = rows[0].map((h) => String(h).trim());
  // Índices por nombre de columna
  const iEmail = header.indexOf("Email");
  const iManager = header.indexOf("ManagerName");
  const iR1 = header.indexOf("Rider1");
  const iR8 = header.indexOf("Rider8");
  const iSpent = header.indexOf("Spent");
  const iRem = header.indexOf("Remaining");
  const iTs = header.indexOf("Timestamp");
  const iLocked = header.indexOf("Locked");

  // Fila por email
  const body = rows.slice(1);
  const foundIdx = body.findIndex((r) => (r[iEmail] || "").toString().trim().toLowerCase() === uid.toLowerCase());
  if (foundIdx === -1) return { header, row: null };

  const r = body[foundIdx];
  const riders: string[] = [];
  if (iR1 >= 0 && iR8 >= 0) {
    for (let i = iR1; i <= iR8; i++) riders.push(String(r[i] ?? "").trim());
  }

  return {
    header,
    row: {
      email: String(r[iEmail] ?? ""),
      managerName: String(r[iManager] ?? ""),
      riders,
      spent: Number(r[iSpent] ?? 0) || 0,
      remaining: Number(r[iRem] ?? 0) || 0,
      timestampIso: String(r[iTs] ?? ""),
      locked: iLocked >= 0 ? String(r[iLocked] ?? "") : "",
    },
  };
}

/**
 * Inserta/actualiza en formato ancho la fila del usuario.
 * Si existe la fila del email → UPDATE; si no → APPEND.
 */
export async function upsertUserPicksWide(data: {
  email: string;
  managerName: string;
  riders: string[];  // máx 8
  spent: number;
  remaining: number;
  locked?: string;   // opcional
}) {
  const sheets = await sheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A:N`,
  });
  const rows = res.data.values || [];
  const header = rows[0] || [];

  // Si la cabecera no existe o no es la esperada, no forzamos a crearlo aquí.
  // Se asume que ya la tienes creada como comentaste.
  // Orden esperado: A Email, B ManagerName, C-J Rider1..Rider8, K Spent, L Remaining, M Timestamp, N Locked
  const outRow = [
    data.email,
    data.managerName,
    ...padTo(data.riders, 8, ""),
    data.spent,
    data.remaining,
    new Date().toISOString(),
    data.locked ?? "",
  ];

  // Busca fila existente por Email (columna A)
  let foundRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const emailCell = (rows[i][0] || "").toString().trim().toLowerCase();
    if (emailCell === data.email.toLowerCase()) {
      foundRowIndex = i + 1; // índice 1-based en Sheets
      break;
    }
  }

  if (foundRowIndex > 0) {
    // UPDATE de A..N en esa fila
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_PICKS}!A${foundRowIndex}:N${foundRowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [outRow] },
    });
    return { updated: true, appended: false };
  }

  // APPEND
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB_PICKS}!A:N`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [outRow] },
  });
  return { updated: false, appended: true };
}
