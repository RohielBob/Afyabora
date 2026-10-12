# Module `imports`

**Lot : L4 · Fonctionnalité : F5 · Tickets : L4-01 à L4-04, L4-08**

Import CSV / Excel avec validation et rapport.

## Routes

- POST /imports/preview : analyse le fichier, crée un lot `PREVIEW`, renvoie le rapport
- POST /imports/:id/commit : applique les décisions (Corriger / Ignorer / Accepter)
- DELETE /imports/:id : annule un lot déjà importé

## Règles de gestion

- Limites : 5 Mo, 5 000 lignes (`IMPORT_MAX_*`).
- CSV : séparateurs `;` `,` tabulation ; virgule ou point décimal ; encodages UTF-8 et Windows-1252.
- Dates `jj/mm/aaaa`, `aaaa-mm-jj`, avec ou sans heure.
- Statuts : VALID, DUPLICATE (dans la base ET dans le fichier), INCONSISTENT (hors bornes pour l'unité), ERROR (illisible, date future).
- RIEN n'est écrit dans `Measurement` avant `commit`.
- Mesures importées : `source = IMPORT`, `importBatchId` renseigné ; annulation = tombstones de tout le lot.

## Lecture des fichiers (L4-01 CSV, L4-02 Excel)

Fonctions pures, sans base : octets du fichier ⇒ en-têtes + lignes. Elles ne décident **pas** du statut d'une ligne (L4-03). Les deux lecteurs rendent la même forme (`ImportTable` : `headers`, `mapping`, `rows`), construite par le même code (`import-table.ts`).

### CSV (`csv-parser.ts`, L4-01)

- **Encodage** : UTF-8 (BOM retiré) ; UTF-16 si le fichier commence par un BOM UTF-16 (export « texte Unicode » d'Excel) ; sinon **Windows-1252**. Les octets 0x80–0x9F (« ’ », « œ », « € », « … ») sont décodés avec la table officielle : le décodeur `windows-1252` de Node les lit comme du Latin-1 et les perdrait.
- **Séparateur** : `;`, tabulation ou `,`. Sur les 20 premières lignes non vides, on garde le séparateur qui donne au moins 2 colonnes dans l'en-tête et le plus de lignes régulières (puis le plus de colonnes, puis l'ordre `;`, tabulation, `,`). Une première ligne Excel `sep=;` impose le séparateur. Une valeur décimale dans un fichier à virgules doit être entre guillemets (`"1,1"`).
- **Numéros de ligne** : ce sont ceux du fichier (l'en-tête est la ligne 1). Les lignes vides sont ignorées mais comptées, ainsi que la ligne `sep=`. Un champ entre guillemets sur deux lignes est bien géré.

### Excel `.xlsx` (`xlsx-parser.ts`, L4-02)

- **Contrôles avant ouverture**, sans rien décompresser (on lit seulement le sommaire du ZIP) :
  - fichier abîmé, ou qui n'est pas un ZIP ⇒ `CORRUPTED` ;
  - ancien `.xls`, ou classeur protégé par mot de passe (format OLE) ⇒ `UNSUPPORTED_FORMAT`, avec le conseil de l'enregistrer en `.xlsx` sans mot de passe ou en CSV ;
  - plus de 50 Mo une fois décompressé, ou plus de 1 000 fichiers internes ⇒ `TOO_LARGE`. C'est la protection contre les « bombes zip ».

  Limite : un ZIP falsifié peut déclarer des tailles fausses. La limite de 5 Mo du fichier reste la première protection.

- Un ZIP lisible qui ne contient **aucune feuille** (photos zippées, document Word) donne aussi `CORRUPTED`.
- **Feuille lue** : la première feuille visible qui contient des données. S'il n'y en a pas, la première feuille masquée qui en contient. Son nom est renvoyé (`sheet`).
- **Cellules ⇒ texte**, pour réutiliser la suite du CSV :
  - date ⇒ `aaaa-mm-jj`, ou `aaaa-mm-jj HH:MM` si une heure est présente ;
  - heure seule ⇒ `HH:MM`, avec les secondes si elles existent, arrondie à la seconde (Excel stocke 07:15 comme 07:14:59,999) ;
  - nombre ⇒ `0.92`, sans le bruit d'arrondi (`0.1 + 0.2` donne `0.3`) ;
  - formule ⇒ son résultat ; texte enrichi ou lien ⇒ son texte ; erreur (`#N/A`) ⇒ `#N/A`, donc une valeur illisible.

  Excel n'a pas de fuseau horaire : la date est rendue telle qu'affichée dans la cellule.

- **Numéros de ligne** : ce sont ceux d'Excel, que le patient voit dans son classeur. Un tableau qui ne commence pas en A1 est accepté (lignes et colonnes vides au début). Les cellules vides ou ne contenant que des espaces en fin de ligne ne comptent pas.
- Non géré pour le MVP :
  - les dates d'un classeur Mac « calendrier 1904 » ;
  - les dates saisies sans format de date, qui apparaissent comme un nombre (par exemple `46296`) et seront donc signalées illisibles.

### Commun aux deux (`import-table.ts`)

- **Nombres** : `0,92`, `0.92`, `1 870` (espace, espace insécable ou espace fine) sont lus. Tout le reste (`abc`, `-5`, `1,2,3`, `1.234,5`, `5 mg/dL`) donne `null`, et la valeur brute est gardée pour le rapport.
- **Colonnes** : date, heure, valeur, unité et contexte sont reconnues d'après l'en-tête, sans accents ni majuscules. Un nom exact passe d'abord (`Glycémie`), puis un nom qui contient le mot entier (`Glycémie (g/L)`). Une colonne ne sert qu'une fois. La correspondance donnée par le patient (`mapping`) passe avant, par nom exact puis sans accents.
- **Lignes abîmées** : une ligne avec trop ou trop peu de colonnes est rendue avec `columnMismatch: true`. L'analyse ne plante jamais à cause d'une ligne.
- **Erreurs sur le fichier entier** (`ImportFileError.code`) :
  - `EMPTY` : rien, ou seulement un en-tête ;
  - `TOO_LARGE` : plus de 5 Mo, ou un classeur trop gros une fois décompressé ;
  - `TOO_MANY_ROWS` : plus de 5 000 lignes ;
  - `NOT_TABULAR` : une seule colonne (CSV) ;
  - `UNKNOWN_COLUMN` : la correspondance donnée cite une colonne absente ;
  - `MISSING_COLUMNS` : date ou valeur introuvable ;
  - `CORRUPTED` et `UNSUPPORTED_FORMAT` : classeur Excel (voir plus haut).

  `UNKNOWN_COLUMN` et `MISSING_COLUMNS` renvoient aussi la liste des en-têtes, pour que l'appli propose de choisir les colonnes (L4-06).

### Tests

- `test/imports-csv.test.ts` : 44 tests, dont les deux fichiers de `scripts/sample-data/`.
- `test/imports-xlsx.test.ts` : 20 tests, dont :
  - les 147 lignes de la démo en vraies cellules Excel, avec les mêmes valeurs que le CSV ;
  - `import-corrupted.xlsx` ;
  - un classeur écrit au format XML exact d'Excel ;
  - des « bombes zip » fabriquées à la main.

## Tests obligatoires

- [ ] `scripts/sample-data/import-demo-147.csv` : 139 valides, 5 doublons, 3 incohérentes.
- [x] `.xlsx` corrompu : erreur claire, pas de plantage (L4-02 : `CORRUPTED`, testé avec `scripts/sample-data/import-corrupted.xlsx`).
- [ ] Annuler un lot supprime toutes ses mesures.
- [ ] Ligne 42 (18,7 g/L) signalée « vérifier l'unité ».

## Fichiers

| Fichier                 | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `imports.module.ts`     | Déclaration du module NestJS                                                                           |
| `imports.controller.ts` | Routes HTTP : validation Zod (`ZodValidationPipe` + schémas de `@glyka/shared`), pas de logique métier |
| `imports.service.ts`    | Logique métier et accès base (Prisma)                                                                  |
| `csv-parser.ts`         | Lecture d'un fichier CSV (encodage, séparateur, numéros de ligne) : fonctions pures                    |
| `xlsx-parser.ts`        | Lecture d'un classeur Excel .xlsx (contrôles du ZIP, feuille, cellules ⇒ texte)                        |
| `import-table.ts`       | Commun CSV / Excel : colonnes, nombres, lignes, erreurs sur le fichier (`ImportFileError`)             |

## Rappels

- Chaque route vérifie le **rôle** (`@Roles`) **et** la **propriété** de la donnée.
- Toute entrée est validée avec un schéma de `@glyka/shared`.
- Aucun secret ni donnée de santé dans les logs.
