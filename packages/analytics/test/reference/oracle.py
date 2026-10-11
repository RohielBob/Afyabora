# Vérification indépendante du jeu de référence (L3-01).
#
# Pourquoi ce fichier : un test qui recopie ce que le code calcule ne prouve rien. Ici, les valeurs
# attendues sont recalculées à partir des RÈGLES DU CAHIER DES CHARGES (§5.2, §5.3), en Python, avec le
# module standard `statistics`, sans lire le code TypeScript. Si ce script et `reference-data.ts`
# (EXPECTED) disent la même chose, l'attendu est validé deux fois : à la main et par ce calcul.
#
# Lancer (PowerShell, depuis la racine du dépôt) :  python packages/analytics/test/reference/oracle.py
# Aucune dépendance : Python 3.8 ou plus suffit. Le script s'arrête avec une erreur si un calcul diffère.
import statistics as st

LOW, HIGH, VERY_LOW = 70, 180, 54  # seuils par défaut (§5.4)

# Semaine de référence : 4 mesures par jour (matin, midi, soir, nuit), None = jour sans mesure.
WEEK = {
    'J1': [95, 140, 175, 120],
    'J2': [70, 150, 180, 110],
    'J3': None,
    'J4': [65, 190, 240, 200],
    'J5': [100, 160, 210, 130],
    'J6': None,
    'J7': [50, 145, 170, 125],
}
PREVIOUS = [120, 200, 110, 210, 130, 220, 100, 190, 140, 230]
SLOTS = ['MORNING', 'NOON', 'EVENING', 'NIGHT']


def pct(part, total):
    return 100 * part / total


days = [d for d in WEEK.values() if d]
values = [v for d in days for v in d]  # dans l'ordre du temps
n = len(values)

# Temps dans la cible / au-dessus / en dessous (§5.2)
assert n == 20
assert pct(len([v for v in values if LOW <= v <= HIGH]), n) == 70
assert pct(len([v for v in values if v > HIGH]), n) == 20
assert pct(len([v for v in values if v < LOW]), n) == 10

# Moyenne, écart-type d'échantillon, coefficient de variation, médiane
mean, sd = st.mean(values), st.stdev(values)
assert mean == 141.25
assert abs(sd - 50.83189529170999) < 1e-10
assert abs(sd / mean * 100 - 35.9871825074053) < 1e-10
assert st.median(values) == 142.5

# Hypoglycémies répétées : 2 ou plus sous le seuil bas sur 7 jours ; alerte si l'une est < 54
lows = [v for v in values if v < LOW]
assert lows == [65, 50] and any(v < VERY_LOW for v in lows)

# Séries hautes : 3 mesures consécutives au-dessus du seuil haut
streaks, current = [], []
for v in values + [0]:  # le 0 final ferme la dernière série
    if v > HIGH:
        current.append(v)
    else:
        if len(current) >= 3:
            streaks.append(current)
        current = []
assert streaks == [[190, 240, 200]]

# Créneaux : au moins 5 mesures et au moins 20 points de % au-dessus de la proportion générale
overall_above = pct(len([v for v in values if v > HIGH]), n)
flagged = []
for i, slot in enumerate(SLOTS):
    slot_values = [d[i] for d in days]
    above = pct(len([v for v in slot_values if v > HIGH]), len(slot_values))
    if len(slot_values) >= 5 and above - overall_above >= 20:
        flagged.append((slot, round(above), round(overall_above)))
assert flagged == [('EVENING', 40, 20)]

# Données manquantes : jours sans aucune mesure
assert sum(1 for d in WEEK.values() if d is None) == 2

# Comparaison avec la période précédente (10 mesures)
assert pct(len([v for v in PREVIOUS if LOW <= v <= HIGH]), len(PREVIOUS)) == 50
assert st.mean(PREVIOUS) == 165

# Score de qualité (§5.3) : 0,5 × couverture + 0,3 × densité + 0,2 × fraîcheur


def quality(days_with, days_in_period, per_day, days_since_last):
    coverage = min(1, days_with / days_in_period)
    density = min(1, per_day / 3)
    if days_since_last <= 1:
        freshness = 1
    elif days_since_last >= 7:
        freshness = 0
    else:
        freshness = 1 - (days_since_last - 1) / 6
    score = round((0.5 * coverage + 0.3 * density + 0.2 * freshness) * 100)
    return score, round(coverage * 100), round(density * 100), round(freshness * 100)


assert quality(5, 7, 4, 1 / 24) == (86, 71, 100, 100)  # semaine de référence
assert quality(30, 30, 3, 0) == (100, 100, 100, 100)
assert quality(15, 30, 2, 4) == (55, 50, 67, 50)
assert quality(30, 30, 1, 7) == (60, 100, 33, 0)
assert quality(3, 30, 1, 10) == (15, 10, 33, 0)
assert quality(30, 30, 3, 2.5)[3] == 75

# Anomalies : score z modifié = 0,6745 × (x − médiane) / MAD, signalé au-delà de 3,5


def modified_z(series):
    med = st.median(series)
    mad = st.median([abs(v - med) for v in series])
    return [0.6745 * (v - med) / mad for v in series]


STABLE = [96, 98, 99, 100, 100, 101, 102, 103, 104]
assert abs(modified_z(STABLE + [170])[-1] - 23.4389) < 1e-4
assert modified_z(STABLE + [111])[-1] > 3.5 > modified_z(STABLE + [110])[-1]

# Seuils personnels (cible 80–160) appliqués à la semaine de référence
assert len([v for v in values if 80 <= v <= 160]) == 10

# Écart-type d'un jeu classique
assert abs(st.stdev([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138089935299395) < 1e-12

print('Jeu de référence : tous les attendus sont confirmés.')
