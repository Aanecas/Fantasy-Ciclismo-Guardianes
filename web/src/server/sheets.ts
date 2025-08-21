import { google } from "googleapis";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function normalizePrivateKey(k: string) {
  return k.replace(/\\n/g, "\n");
}

export async function sheetsClient() {
  const keyFile = process.env.GOOGLE_SA_KEYFILE;          // ej: ../credentials.service-account.json
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL; // alternativa sin fichero
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY;

  // DEBUG: ver qué rama usamos
  console.log("[Sheets] keyFile =", keyFile ?? "(none)");
  console.log("[Sheets] clientEmail set? ", !!clientEmail);

  if (keyFile) {
    const resolved = path.resolve(process.cwd(), keyFile);
    const auth = new google.auth.GoogleAuth({ keyFile: resolved, scopes: SCOPES });
    return google.sheets({ version: "v4", auth });
  }
  if (clientEmail && privateKey) {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: normalizePrivateKey(privateKey) },
      scopes: SCOPES,
    });
    return google.sheets({ version: "v4", auth });
  }
  throw Object.assign(
    new Error("Faltan credenciales: define GOOGLE_SA_KEYFILE o (GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY)"),
    { code: "MISSING_CREDENTIALS" }
  );
}

export async function upsertUser({
  uid, email, name, image,
}: {
  uid: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  const sheets = await sheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const tab = process.env.GOOGLE_SHEETS_USERS_TAB || "Users";

  const read = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:A` });
  const rows = read.data.values || [];
  const idx = rows.findIndex(r => r[0] === uid);
  const now = new Date().toISOString();

  if (idx >= 0) {
    const rowNumber = idx + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A${rowNumber}:G${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[uid, email ?? "", name ?? "", image ?? "", "", now, "TRUE"]] },
    });
    return { updated: true, row: rowNumber };
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[uid, email ?? "", name ?? "", image ?? "", now, now, "TRUE"]] },
    });
    return { created: true };
  }
}
