// web/src/lib/sheets.ts
import { google } from "googleapis";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Acepta cualquiera de estos nombres:
export const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID ??
  process.env.GOOGLE_SHEETS_ID ??
  process.env.SHEETS_SPREADSHEET_ID ??
  "";

function assertEnv() {
  if (!SPREADSHEET_ID) {
    throw new Error(
      "Missing env: GOOGLE_SHEET_ID (o GOOGLE_SHEETS_ID / SHEETS_SPREADSHEET_ID)"
    );
  }
  const keyFile = process.env.GOOGLE_SA_KEYFILE;
  if (!keyFile) {
    throw new Error("Missing env: GOOGLE_SA_KEYFILE");
  }
  return { keyFile };
}

export async function getSheets() {
  const { keyFile } = assertEnv();
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(process.cwd(), keyFile),
    scopes: SCOPES,
  });
  return google.sheets({ version: "v4", auth });
}
