# scripts/python/write_startlist_to_sheet.py
#
# Vuelca la startlist a Google Sheets leyendo de:
#   data/startlist-2024.values.json   (con Value calculado)
#
# Abre SIEMPRE por ID (fijo). No lista Drive.
# Columnas: Rider | Team | PCS_Rider_URL | Role | Value | Adj | FinalValue
# FinalValue = E + F (suma simple)

from __future__ import annotations
import json
from pathlib import Path
from typing import List

import gspread
from google.oauth2.service_account import Credentials as ServiceAccountCredentials
from google.oauth2.credentials import Credentials as UserCredentials
from google_auth_oauthlib.flow import InstalledAppFlow

# ===== Config =====
ROOT = Path(__file__).resolve().parents[2]
DATA_JSON = ROOT / "data" / "startlist-2024.values.json"   # <- leemos la versión con valores
CREDENTIALS = ROOT / "credentials.json"
TOKEN = ROOT / "token.json"

# ID fijo de tu Google Sheet
SHEET_ID  = "1nXBwTgG9jijsUmcBkSeVPunP8n7OVNYe_WKPneJkWmA"
SHEET_TAB = "Startlist"

# Solo spreadsheets (no Drive)
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

def load_client() -> gspread.Client:
    """Autenticación: Service Account (preferente) u OAuth de usuario."""
    if not CREDENTIALS.exists():
        raise FileNotFoundError(f"No encuentro {CREDENTIALS}. Pon tus credenciales en la raíz del repo.")

    raw = CREDENTIALS.read_text(encoding="utf-8")
    is_service = '"type": "service_account"' in raw

    if is_service:
        creds = ServiceAccountCredentials.from_service_account_file(str(CREDENTIALS), scopes=SCOPES)
        return gspread.authorize(creds)

    # OAuth de usuario: usa/crea token.json
    if TOKEN.exists():
        creds = UserCredentials.from_authorized_user_file(str(TOKEN), SCOPES)
    else:
        flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN.write_text(creds.to_json(), encoding="utf-8")

    return gspread.authorize(creds)

def open_sheet(gc: gspread.Client):
    """Abrir SIEMPRE por ID. Si no existe la pestaña, la crea."""
    sh = gc.open_by_key(SHEET_ID)
    try:
        ws = sh.worksheet(SHEET_TAB)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=SHEET_TAB, rows=2000, cols=10)
    return sh, ws

def read_rows() -> List[List]:
    """Lee el JSON de valores y lo convierte a filas A:G."""
    if not DATA_JSON.exists():
        raise FileNotFoundError(f"No existe {DATA_JSON}. Genera antes los valores con compute_values.py")

    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))

    rows: List[List] = []
    for r in data:
        rows.append([
            r.get("Rider", ""),
            r.get("Team", ""),
            r.get("PCS_Rider_URL", ""),
            r.get("Role", ""),          # <- Role ya se vuelca a la hoja
            r.get("Value", 0),
            r.get("Adj", 0),
            "",                          # FinalValue -> fórmula abajo
        ])
    return rows

def write_sheet(ws, rows: List[List]):
    headers = ["Rider", "Team", "PCS_Rider_URL", "Role", "Value", "Adj", "FinalValue"]

    # Limpia y pone cabeceras
    ws.clear()
    ws.update("A1", [headers])

    if not rows:
        return

    # Vuelco A2:F (datos sin FinalValue)
    ws.update(f"A2:F{len(rows)+1}", [r[:6] for r in rows], value_input_option="RAW")

    # Fórmulas para G (FinalValue = E + F)
    formulas = [[f"=E{row}+F{row}"] for row in range(2, len(rows)+2)]
    ws.update(f"G2:G{len(rows)+1}", formulas, value_input_option="USER_ENTERED")

def main():
    print("⏳ Autenticando…")
    gc = load_client()
    sh, ws = open_sheet(gc)
    print(f"📄 Abierto por ID: {sh.id}  |  Pestaña: {ws.title}")

    print(f"📥 Leyendo {DATA_JSON.name} …")
    rows = read_rows()

    print(f"✍️ Escribiendo {len(rows)} filas…")
    write_sheet(ws, rows)

    print("✅ Listo. Revisa tu Google Sheet (Startlist).")

if __name__ == "__main__":
    main()
