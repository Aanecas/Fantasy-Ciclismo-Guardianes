# scripts/python/scrape_startlist.py

import os
import json
from pathlib import Path
from procyclingstats import RaceStartlist  # importa la librería oficial

# Configuración de rutas
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
OUTPUT_JSON = DATA_DIR / "startlist-2024.json"

# Race identifier para la Vuelta a España 2024
RACE_SLUG = "race/vuelta-a-espana/2024/startlist"

def main():
    print(f"⏳ Generando startlist con procyclingstats: {RACE_SLUG}")
    rs = RaceStartlist(RACE_SLUG)
    raw = rs.startlist()

    rows = []
    seen = set()
    for r in raw:
        name = r.get("rider_name", "").strip()
        team = r.get("team_name", "").strip()
        rel_url = r.get("rider_url", "").strip()
        full_url = f"https://www.procyclingstats.com/{rel_url}" if rel_url else ""

        key = f"{name}||{team}"
        if name and key not in seen:
            seen.add(key)
            rows.append({
                "Rider": name,
                "Team": team,
                "PCS_Rider_URL": full_url,
                "Role": "",
                "Value": 0,
                "Adj": 0,
                "FinalValue": 0
            })

    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"✅ Guardados {len(rows)} corredores en {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
