// src/server/sheetsPCS.ts
import path from "path";
import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { parseStageResults, buildVuelta2024StageUrl, fetchStageHTML, StageResult } from "@/lib/pcs";

// ===== Config =====
const SHEET_ID =
  process.env.GOOGLE_SHEETS_ID ||
  process.env.GOOGLE_SHEET_ID || // fallback por si lo tienes así
  "";

const RESULTS_RAW_TAB = process.env.GOOGLE_SHEETS_RESULTS_RAW_TAB || "ResultsRaw";
const SA_KEYFILE = process.env.GOOGLE_SA_KEYFILE || "../credentials.service-account.json";

// ===== Google Sheets client =====
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getSheetsClient(): sheets_v4.Sheets {
  if (!SHEET_ID) {
    throw new Error("Falta GOOGLE_SHEETS_ID en .env.local");
  }
  const keyFilePath = path.resolve(process.cwd(), SA_KEYFILE);
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: SCOPES,
  });
  return google.sheets({ version: "v4", auth });
}

// ===== Util: cabecera ResultsRaw que ya usas =====
// Stage | Category | Rank | Rider | Team | TimeOrPts | Note | BreakawayIcon | Timestamp
async function ensureResultsRawHeaders(sheets = getSheetsClient()) {
  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${RESULTS_RAW_TAB}!A1:I1`,
    majorDimension: "ROWS",
  });

  const expected = [
    "Stage",
    "Category",
    "Rank",
    "Rider",
    "Team",
    "TimeOrPts",
    "Note",
    "BreakawayIcon",
    "Timestamp",
  ];

  const have = read.data.values?.[0] || [];
  const isSame =
    have.length >= expected.length &&
    expected.every((h, i) => (have[i] || "").toString().trim() === h);

  if (!isSame) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${RESULTS_RAW_TAB}!A1:I1`,
      valueInputOption: "RAW",
      requestBody: { values: [expected] },
    });
  }
}

// ===== Limpieza extra del nombre del corredor =====
function tidyRiderName(name: string): string {
  // p.ej. "O'Connor Ben La" -> "O'Connor Ben", "Kuss Sepp a" -> "Kuss Sepp"
  return name.replace(/\s+(?:La|El|De|Del|a|al)$/i, "").trim();
}

// ===== Persistir una etapa en ResultsRaw =====
export async function persistStageToResultsRaw(stage: number) {
  if (!Number.isFinite(stage) || stage < 1) {
    throw new Error("Parámetro 'stage' inválido");
  }

  const url = buildVuelta2024StageUrl(stage);
  const html = await fetchStageHTML(url);
  const parsed: StageResult[] = parseStageResults(html, stage);
  if (!parsed || parsed.length === 0) {
    throw new Error(`No se pudieron extraer resultados de la etapa ${stage}`);
  }

  const sheets = getSheetsClient();
  await ensureResultsRawHeaders(sheets);

  // Mapeo EXACTO a tu hoja:
  // Stage | Category("Stage") | Rank | Rider | Team | TimeOrPts | Note | BreakawayIcon | Timestamp
  const nowIso = new Date().toISOString();
  const values = parsed.map((r) => [
    r.Stage,                           // Stage
    "Stage",                           // Category -> fijamos "Stage"
    r.Rank,                            // Rank
    tidyRiderName(r.Rider),            // Rider (limpio)
    r.Team,                            // Team
    r.Time,                            // TimeOrPts
    "",                                // Note
    r.BreakawayIcon ? "TRUE" : "FALSE",// BreakawayIcon
    nowIso,                            // Timestamp
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${RESULTS_RAW_TAB}!A:I`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });

  return { ok: true, stage, count: values.length };
}

// ===== (Opcional) util para borrar resultados previos de una etapa en ResultsRaw =====
export async function clearStageFromResultsRaw(stage: number) {
  const sheets = getSheetsClient();

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${RESULTS_RAW_TAB}!A2:I`,
    majorDimension: "ROWS",
  });

  const rows = read.data.values || [];
  if (rows.length === 0) return { ok: true, removed: 0 };

  const keep: string[][] = [];
  let removed = 0;
  for (const row of rows) {
    const st = parseInt((row[0] || "").toString().trim(), 10);
    if (st === stage) removed++;
    else keep.push(row);
  }

  await ensureResultsRawHeaders(sheets);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${RESULTS_RAW_TAB}!A2:I`,
  });

  if (keep.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${RESULTS_RAW_TAB}!A2:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: keep },
    });
  }

  return { ok: true, removed };
}
