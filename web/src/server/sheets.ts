// src/server/sheets.ts
import path from "node:path";
import fs from "node:fs";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function sheetsClient() {
  const keyFile = process.env.GOOGLE_SA_KEYFILE;
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY;

  let auth;

  if (keyFile) {
    const abs = path.resolve(process.cwd(), keyFile);
    auth = new google.auth.GoogleAuth({
      keyFile: abs,
      scopes: SCOPES,
    });
  } else if (clientEmail && privateKey) {
    auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: SCOPES,
    });
  } else {
    throw Object.assign(new Error("Missing SA credentials"), {
      code: "MISSING_CREDENTIALS",
    });
  }

  return google.sheets({ version: "v4", auth });
}

export async function getValues(spreadsheetId: string, range: string) {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}

export type RowObject = Record<string, string>;

export function rowsToObjects(rows: string[][]): RowObject[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((r) => {
    const o: RowObject = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").toString()));
    return o;
  });
}
