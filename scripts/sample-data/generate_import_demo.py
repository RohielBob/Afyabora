#!/usr/bin/env python3
"""Génère les fichiers d'import de test (ticket L4-08). Déterministe : même résultat à chaque exécution.

import-demo-147.csv : 147 lignes de données = 139 valides + 5 doublons + 3 valeurs incohérentes.
Numérotation : « ligne » = numéro de ligne du FICHIER (l'en-tête est la ligne 1).
  - incohérentes aux lignes 42 (18,7 g/L), 90 (0,02 g/L) et 121 (9,9 g/L) ;
  - doublons : copies exactes d'une ligne précédente.
Données FICTIVES. Séparateur « ; », virgule décimale, unité g/L.
"""
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

OUT = Path(__file__).parent
rnd = random.Random(2026)

SLOTS = [(7, 15, "à jeun", 1.08), (12, 40, "avant repas", 1.28), (19, 20, "après repas", 1.55)]
end = datetime(2026, 10, 3)

# 139 mesures valides, ~3 par jour, triées chronologiquement
valid = []
day = end
while len(valid) < 139:
    for h, m, ctx, base in SLOTS:
        if len(valid) >= 139:
            break
        value = round(min(2.8, max(0.6, base + (rnd.random() + rnd.random() + rnd.random() - 1.5) * 0.4)), 2)
        valid.append((day.replace(hour=h, minute=m + rnd.randint(0, 9)), value, ctx))
    day -= timedelta(days=1)
valid.sort(key=lambda r: r[0])

INCOHERENT = {42: 18.7, 90: 0.02, 121: 9.9}          # numéros de ligne du fichier
DUPLICATES = {20, 38, 65, 104, 138}                    # numéros de ligne du fichier

rows, vi = [], 0
for line in range(2, 149):                              # lignes 2..148 = 147 lignes de données
    if line in INCOHERENT:
        prev = rows[-1][0] if rows else valid[0][0]
        ts = prev + timedelta(minutes=2)
        rows.append((ts, INCOHERENT[line], "autre"))
    elif line in DUPLICATES:
        rows.append(rows[-1])
    else:
        rows.append(valid[vi]); vi += 1
assert vi == 139 and len(rows) == 147

def fmt(v):
    return f"{v:.2f}".replace(".", ",")

path = OUT / "import-demo-147.csv"
with path.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["date", "heure", "glycemie", "unite", "contexte"])
    for ts, v, ctx in rows:
        w.writerow([ts.strftime("%d/%m/%Y"), ts.strftime("%H:%M"), fmt(v), "g/L", ctx])

# Petit fichier encodé en Windows-1252 (accents) pour tester la détection d'encodage.
with (OUT / "import-windows1252.csv").open("w", newline="", encoding="cp1252") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["date", "heure", "glycémie", "unité", "contexte"])
    for ts, v, ctx in valid[:10]:
        w.writerow([ts.strftime("%d/%m/%Y"), ts.strftime("%H:%M"), fmt(v), "g/L", ctx])

# Fichier .xlsx volontairement corrompu : l'API doit répondre par une erreur claire, sans planter.
(OUT / "import-corrupted.xlsx").write_bytes(b"PK\x03\x04 ceci n'est pas un vrai classeur Excel" + bytes(range(64)))
print("Fichiers générés dans", OUT)
