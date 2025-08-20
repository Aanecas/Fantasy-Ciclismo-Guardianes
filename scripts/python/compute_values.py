# Calcula Value usando la librería oficial `procyclingstats`:
# 1) Ranking individual (points por rider_url)
# 2) Fallback: Rider.points_per_season_history() (temporada actual)
# 3) Normaliza p10–p99 + ^0.6, bonus por Role, clamp [50, 500]
# 4) Guarda en data/startlist-2024.values.json

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from datetime import datetime

from procyclingstats import Ranking, Rider  # pip install procyclingstats

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
SRC_JSON = DATA_DIR / "startlist-2024.json"
OUT_JSON = DATA_DIR / "startlist-2024.values.json"

# Bonus por rol (si Role contiene estas palabras, case-insensitive)
ROLE_BONUS = {
    "leader": 1.15,
    "gc": 1.12,
    "sprinter": 1.10,
    "puncheur": 1.08,
    "climber": 1.08,
    "tt": 1.05,
    "helper": 1.00,
    "domestique": 1.00,
}

CLAMP_MIN = 50
CLAMP_MAX = 500

def pct(arr: List[float], q: float) -> float:
    if not arr:
        return 0.0
    a = sorted(arr)
    if len(a) == 1:
        return a[0]
    pos = (q/100.0) * (len(a)-1)
    lo = int(pos)
    hi = min(lo + 1, len(a)-1)
    frac = pos - lo
    return a[lo] * (1-frac) + a[hi] * frac

def infer_role_bonus(role: str) -> float:
    if not role:
        return 1.0
    rlow = role.lower()
    for k, m in ROLE_BONUS.items():
        if k in rlow:
            return m
    return 1.0

def load_startlist() -> List[Dict]:
    if not SRC_JSON.exists():
        raise FileNotFoundError(f"No existe {SRC_JSON}. Genera primero la startlist.")
    return json.loads(SRC_JSON.read_text(encoding="utf-8"))

def build_points_map_from_ranking() -> Dict[str, float]:
    """Devuelve { 'rider/slug': points } desde rankings/me/individual."""
    table = Ranking("rankings/me/individual").individual_ranking()  # rider_url, points, etc.
    mp: Dict[str, float] = {}
    for row in table:
        url = row.get("rider_url")  # p.ej. 'rider/tadej-pogacar'
        pts = row.get("points")
        if url and isinstance(pts, (int, float)):
            mp[url] = float(pts)
    return mp

def get_season_points_from_rider(rider_url: str) -> Optional[float]:
    """Fallback: sumamos puntos de la temporada actual desde la ficha."""
    try:
        r = Rider(rider_url)
        hist = r.points_per_season_history()  # [{'season': 2024, 'points': 1234.0, ...}, ...]
        if not hist:
            return None
        current_year = datetime.now().year
        # Busca temporada actual; si no, la última disponible
        season_row = next((h for h in hist if int(h.get("season", 0)) == current_year), None)
        if not season_row:
            season_row = max(hist, key=lambda h: int(h.get("season", 0)))
        pts = season_row.get("points")
        return float(pts) if isinstance(pts, (int, float)) else None
    except Exception:
        return None

def main():
    startlist = load_startlist()
    if not startlist:
        print("⚠ startlist vacía.")
        return

    print("🔎 Cargando ranking PCS (individual)…")
    rank_map = build_points_map_from_ranking()  # rider_url -> points

    base_scores: List[Tuple[int, float]] = []
    missing: List[Tuple[int, str]] = []

    for i, r in enumerate(startlist):
        pcs_url_full = r.get("PCS_Rider_URL", "").strip()
        # Convertimos a forma relativa que usa la librería: 'rider/slug'
        rider_url = pcs_url_full.split("procyclingstats.com/")[-1].strip("/")
        if not rider_url:
            base_scores.append((i, 0.0))
            continue

        pts = rank_map.get(rider_url)
        if pts is None:
            missing.append((i, rider_url))
            base_scores.append((i, 0.0))
        else:
            base_scores.append((i, float(pts)))

    # Fallback por los que faltan
    if missing:
        print(f"↩️ Fallback por ficha de {len(missing)} corredores sin ranking…")
        for i, rider_url in missing:
            pts = get_season_points_from_rider(rider_url)
            if pts is not None:
                base_scores[i] = (i, float(pts))  # sustituye 0.0

    values_only = [v for _, v in base_scores]
    p10 = pct(values_only, 10) if values_only else 0.0
    p99 = pct(values_only, 99) if values_only else 1.0
    if p99 <= p10:
        # distribución degenerada
        p10, p99 = 0.0, max(1.0, max(values_only) if values_only else 1.0)

    def norm_score(x: float) -> float:
        if x <= p10:
            z = 0.0
        elif x >= p99:
            z = 1.0
        else:
            z = (x - p10) / (p99 - p10)
        return z ** 0.6

    results: List[Dict] = []
    for i, pts in base_scores:
        rider = startlist[i]
        role = rider.get("Role", "")

        z = norm_score(float(pts))
        base_value = 50 + z * (500 - 50)

        mult = infer_role_bonus(role)
        value = base_value * mult
        value = max(CLAMP_MIN, min(CLAMP_MAX, value))

        results.append({
            "Rider": rider.get("Rider", ""),
            "Team": rider.get("Team", ""),
            "PCS_Rider_URL": rider.get("PCS_Rider_URL", ""),
            "Role": role,
            "Value": round(value, 0),
            "Adj": float(rider.get("Adj", 0) or 0),
            "FinalValue": 0
        })

    OUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Valores calculados OK → {OUT_JSON}")
    print(f"ℹ p10={p10:.1f} | p99={p99:.1f} | riders: {len(results)}")

if __name__ == "__main__":
    main()